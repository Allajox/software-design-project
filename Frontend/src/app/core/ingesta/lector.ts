/**
 * Lectores de archivos (RF-1): convierten CSV, JSON, GeoJSON y hojas de Excel en una misma
 * "tabla cruda" (cabeceras + filas de valores sin validar). La validación va aparte.
 * Todo es puro (texto o matriz de entrada → tabla de salida), sin tocar el navegador.
 */

export type Formato = 'csv' | 'json' | 'geojson' | 'excel';

export interface FilaCruda {
  /** Número de fila tal como la ve la persona: en tablas la cabecera es la 1; en JSON, la posición del registro */
  numero: number;
  valores: Record<string, unknown>;
  /** Problema de estructura detectado al leer (columnas de más, registro que no es un objeto…) */
  errorEstructura?: string;
}

export interface TablaCruda {
  formato: Formato;
  cabeceras: string[];
  filas: FilaCruda[];
}

export const MAX_FILAS = 100_000;
export const MAX_BYTES = 15 * 1024 * 1024;

/** El archivo no se pudo leer (no es un problema de un registro, sino del archivo completo) */
export class ErrorLectura extends Error {}

export type FormatoDetectado = Formato | 'xls' | null;

export function detectarFormato(nombre: string): FormatoDetectado {
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  if (['csv', 'tsv', 'txt'].includes(ext)) return 'csv';
  if (ext === 'json') return 'json';
  if (ext === 'geojson') return 'geojson';
  if (ext === 'xlsx') return 'excel';
  if (ext === 'xls') return 'xls';
  return null;
}

/**
 * Convierte los bytes del archivo en texto. Prueba UTF-8; si no lo es, asume Windows-1252, que es
 * como Excel en Windows guarda por defecto un «CSV (delimitado por comas)» (así no se rompen las tildes).
 */
export function decodificarTexto(bytes: Uint8Array): { texto: string; codificacion: 'UTF-8' | 'UTF-16' | 'Windows-1252' } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { texto: new TextDecoder('utf-16le').decode(bytes), codificacion: 'UTF-16' };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { texto: new TextDecoder('utf-16be').decode(bytes), codificacion: 'UTF-16' };
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes), codificacion: 'UTF-8' };
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(bytes), codificacion: 'Windows-1252' };
  }
}

const vacia = (celda: unknown): boolean => celda === null || celda === undefined || String(celda).trim() === '';

// ---------- CSV ----------

/** Elige el separador que más se repite en la primera línea (fuera de comillas). Empate: ; luego , */
export function detectarSeparador(texto: string): string {
  const candidatos = [';', ',', '\t', '|'];
  const cuenta = new Map(candidatos.map((c) => [c, 0]));
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') entreComillas = !entreComillas;
    else if (!entreComillas && (c === '\n' || c === '\r')) {
      if ([...cuenta.values()].some((n) => n > 0)) break; // primera línea con contenido
    } else if (!entreComillas && cuenta.has(c)) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return candidatos.reduce((mejor, c) => ((cuenta.get(c) ?? 0) > (cuenta.get(mejor) ?? 0) ? c : mejor), ';');
}

/** Divide el texto en filas de celdas respetando comillas, comillas dobles ("") y saltos de línea dentro de comillas */
export function dividirCsv(texto: string, separador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  let iniciadaFila = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else entreComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"' && celda === '') {
      entreComillas = true;
      iniciadaFila = true;
    } else if (c === separador) {
      fila.push(celda);
      celda = '';
      iniciadaFila = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
      iniciadaFila = false;
    } else {
      celda += c;
      iniciadaFila = true;
    }
  }
  if (entreComillas) {
    throw new ErrorLectura(`El archivo termina con comillas sin cerrar (fila ${filas.length + 1}). Revise que cada texto entre comillas tenga su cierre.`);
  }
  if (iniciadaFila || celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** Cabeceras únicas: si una columna se repite, la segunda queda como "Nombre (2)" */
function cabecerasUnicas(crudas: string[]): string[] {
  const vistas = new Map<string, number>();
  return crudas.map((h) => {
    const nombre = h.trim();
    const n = (vistas.get(nombre) ?? 0) + 1;
    vistas.set(nombre, n);
    return n === 1 ? nombre : `${nombre} (${n})`;
  });
}

/** Arma la tabla a partir de una matriz de celdas (CSV o Excel): la primera fila con datos es la cabecera */
export function tablaDesdeMatriz(matriz: readonly (readonly unknown[])[], formato: Formato): TablaCruda {
  const inicio = matriz.findIndex((fila) => fila.some((c) => !vacia(c)));
  if (inicio < 0) throw new ErrorLectura('El archivo está vacío: no tiene ninguna fila con datos.');

  const cabeceras = cabecerasUnicas(matriz[inicio].map((c) => String(c ?? '')));
  const datos = matriz.slice(inicio + 1);
  if (datos.length > MAX_FILAS) {
    throw new ErrorLectura(`El archivo tiene más de ${MAX_FILAS.toLocaleString('es-CR')} filas. Divídalo en varios archivos.`);
  }

  const filas: FilaCruda[] = datos.map((celdas, i) => {
    const valores: Record<string, unknown> = {};
    cabeceras.forEach((h, j) => {
      if (j < celdas.length) valores[h] = celdas[j];
    });
    const sobrantes = celdas.slice(cabeceras.length).filter((c) => !vacia(c)).length;
    return {
      numero: inicio + i + 2,
      valores,
      errorEstructura: sobrantes
        ? `La fila tiene ${celdas.length} columnas y la cabecera ${cabeceras.length}. Suele pasar cuando un texto contiene el separador y no está entre comillas.`
        : undefined,
    };
  });
  return { formato, cabeceras, filas };
}

/**
 * Al exportar, los textos que empiezan con = + - @ llevan una comilla simple delante para que Excel
 * no los ejecute como fórmula (ver neutralizarFormula). Al leer se quita, para que un archivo
 * exportado por el sistema se pueda volver a cargar tal cual.
 */
const quitarNeutralizacion = (celda: string): string => (/^'[=+\-@\t\r]/.test(celda) ? celda.slice(1) : celda);

export function parsearCsv(texto: string): TablaCruda {
  const limpio = texto.replace(/^\uFEFF/, '');
  if (!limpio.trim()) throw new ErrorLectura('El archivo está vacío: no tiene ninguna fila con datos.');
  const matriz = dividirCsv(limpio, detectarSeparador(limpio)).map((fila) => fila.map(quitarNeutralizacion));
  return tablaDesdeMatriz(matriz, 'csv');
}

// ---------- JSON y GeoJSON ----------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function extraerRegistros(raiz: unknown): { registros: unknown[]; formato: Formato } {
  if (Array.isArray(raiz)) return { registros: raiz, formato: 'json' };
  if (esObjeto(raiz)) {
    if (raiz['type'] === 'FeatureCollection' && Array.isArray(raiz['features'])) {
      const registros = raiz['features'].map((f) => {
        if (!esObjeto(f)) return f;
        const props = esObjeto(f['properties']) ? { ...f['properties'] } : {};
        const geom = f['geometry'];
        if (esObjeto(geom) && geom['type'] === 'Point' && Array.isArray(geom['coordinates'])) {
          const [lon, lat] = geom['coordinates'] as unknown[]; // GeoJSON guarda primero la longitud
          if (!('longitud' in props)) props['longitud'] = lon;
          if (!('latitud' in props)) props['latitud'] = lat;
        }
        return props;
      });
      return { registros, formato: 'geojson' };
    }
    for (const clave of ['registros', 'siniestros', 'datos', 'data', 'items']) {
      if (Array.isArray(raiz[clave])) return { registros: raiz[clave] as unknown[], formato: 'json' };
    }
  }
  throw new ErrorLectura(
    'No se encontraron registros. El JSON debe ser una lista de objetos, un objeto con la lista en «registros» o «datos», o un GeoJSON FeatureCollection.',
  );
}

export function parsearJson(texto: string): TablaCruda {
  let raiz: unknown;
  try {
    raiz = JSON.parse(texto.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new ErrorLectura(`El archivo no es un JSON válido: ${e instanceof Error ? e.message : 'error de sintaxis'}.`);
  }
  const { registros, formato } = extraerRegistros(raiz);
  if (registros.length === 0) throw new ErrorLectura('El archivo está vacío: la lista de registros no tiene elementos.');
  if (registros.length > MAX_FILAS) {
    throw new ErrorLectura(`El archivo tiene más de ${MAX_FILAS.toLocaleString('es-CR')} registros. Divídalo en varios archivos.`);
  }

  const cabeceras = new Set<string>();
  const filas: FilaCruda[] = registros.map((r, i) => {
    if (!esObjeto(r)) {
      return { numero: i + 1, valores: {}, errorEstructura: 'El registro no es un objeto con campos (por ejemplo {"fecha": "...", "provincia": "..."}).' };
    }
    Object.keys(r).forEach((k) => cabeceras.add(k));
    return { numero: i + 1, valores: r };
  });
  return { formato, cabeceras: [...cabeceras], filas };
}
