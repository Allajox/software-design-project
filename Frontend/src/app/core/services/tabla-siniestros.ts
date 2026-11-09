import { DIAS, EDADES, FRANJAS, RUTAS, SEVERIDADES } from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';

/**
 * Definición de las columnas del Explorador de registros (RF-4).
 * Es la ÚNICA fuente: la tabla de pantalla y los archivos exportados salen de aquí,
 * así lo que se ve es lo que se exporta.
 */
export interface ColumnaTabla {
  clave: string;
  titulo: string;
  /** Texto que se muestra en la tabla */
  texto: (s: Siniestro) => string;
  /** Valor para CSV, Excel y PDF (los números siguen siendo números) */
  exportar: (s: Siniestro) => string | number;
  /** Valor con el que se ordena (la gravedad se ordena por nivel, no alfabéticamente) */
  orden: (s: Siniestro) => string | number;
  alinear: 'izq' | 'der';
  /** ¿Aparece en pantalla al abrir el explorador? */
  visibleInicial: boolean;
  /** ¿Cabe en el PDF? (el PDF es una hoja, no admite 20 columnas) */
  enPdf: boolean;
  /** Ancho aproximado en caracteres para Excel */
  ancho: number;
}

interface OpcionesColumna {
  alinear?: 'izq' | 'der';
  visibleInicial?: boolean;
  enPdf?: boolean;
  ancho?: number;
  orden?: (s: Siniestro) => string | number;
  texto?: (s: Siniestro) => string;
}

function columna(
  clave: string,
  titulo: string,
  valor: (s: Siniestro) => string | number,
  op: OpcionesColumna = {},
): ColumnaTabla {
  return {
    clave,
    titulo,
    texto: op.texto ?? ((s) => String(valor(s))),
    exportar: valor,
    orden: op.orden ?? valor,
    alinear: op.alinear ?? 'izq',
    visibleInicial: op.visibleInicial ?? true,
    enPdf: op.enPdf ?? true,
    ancho: op.ancho ?? 14,
  };
}

const numero = (op: OpcionesColumna = {}): OpcionesColumna => ({ alinear: 'der', ...op });
/** Gravedad ascendente = de menos a más grave (Leve → Grave → Fallecido) */
const nivelGravedad = (s: Siniestro) => SEVERIDADES.length - SEVERIDADES.indexOf(s.severidad);

export const COLUMNAS: readonly ColumnaTabla[] = [
  columna('id', 'ID', (s) => s.id, numero({ ancho: 8 })),
  columna('fecha', 'Fecha', (s) => s.fecha, { ancho: 12 }),
  columna('diaSemana', 'Día', (s) => s.diaSemana, { orden: (s) => DIAS.indexOf(s.diaSemana), visibleInicial: false, enPdf: false }),
  columna('franja', 'Franja', (s) => s.franja, { orden: (s) => FRANJAS.indexOf(s.franja), ancho: 12 }),
  columna('provincia', 'Provincia', (s) => s.provincia, { ancho: 13 }),
  columna('canton', 'Cantón', (s) => s.canton, { enPdf: false, ancho: 16 }),
  columna('distrito', 'Distrito', (s) => s.distrito, { visibleInicial: false, enPdf: false, ancho: 18 }),
  columna('ruta', 'Ruta', (s) => s.ruta, { orden: (s) => RUTAS.indexOf(s.ruta), ancho: 9 }),
  columna('kilometro', 'Km', (s) => s.kilometro, numero({ ancho: 6 })),
  columna('vehiculo', 'Vehículo', (s) => s.vehiculo, { ancho: 18 }),
  columna('severidad', 'Severidad', (s) => s.severidad, { orden: nivelGravedad, ancho: 11 }),
  columna('fallecidos', 'Fallecidos', (s) => s.fallecidos, numero({ ancho: 11 })),
  columna('heridosGraves', 'Heridos graves', (s) => s.heridosGraves, numero({ ancho: 14 })),
  columna('heridosLeves', 'Heridos leves', (s) => s.heridosLeves, numero({ ancho: 13 })),
  columna('clima', 'Clima', (s) => s.clima, { ancho: 13 }),
  columna('calzada', 'Calzada', (s) => s.calzada, { ancho: 10 }),
  columna('senalizacion', 'Señalización', (s) => (s.senalizacion ? 'Sí' : 'No'), { visibleInicial: false, enPdf: false, ancho: 13 }),
  columna('edad', 'Edad', (s) => s.edad, { orden: (s) => EDADES.indexOf(s.edad), ancho: 8 }),
  columna('genero', 'Género', (s) => s.genero, { ancho: 11 }),
  columna('condicion', 'Condición', (s) => s.condicion, { visibleInicial: false, enPdf: false, ancho: 13 }),
  columna('tiempoRespuestaMin', 'Respuesta (min)', (s) => s.tiempoRespuestaMin, numero({ ancho: 15 })),
  columna('latitud', 'Latitud', (s) => s.latitud ?? '', numero({ visibleInicial: false, enPdf: false, ancho: 11 })),
  columna('longitud', 'Longitud', (s) => s.longitud ?? '', numero({ visibleInicial: false, enPdf: false, ancho: 11 })),
];

export const COLUMNA_POR_CLAVE: ReadonlyMap<string, ColumnaTabla> = new Map(COLUMNAS.map((c) => [c.clave, c]));

// ---------- Ordenamiento multinivel ----------

export type Direccion = 'asc' | 'desc';
export interface CriterioOrden {
  clave: string;
  direccion: Direccion;
}

function comparar(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es');
}

/**
 * Ordena por varios criterios: el primero manda y los siguientes desempatan.
 * Si todo empata, se ordena por ID para que el resultado sea siempre el mismo.
 * No modifica la lista original.
 */
export function ordenarSiniestros(
  datos: readonly Siniestro[],
  criterios: readonly CriterioOrden[],
): Siniestro[] {
  const activos = criterios
    .map((c) => ({ col: COLUMNA_POR_CLAVE.get(c.clave), signo: c.direccion === 'asc' ? 1 : -1 }))
    .filter((c): c is { col: ColumnaTabla; signo: number } => !!c.col);

  return [...datos].sort((a, b) => {
    for (const { col, signo } of activos) {
      const r = comparar(col.orden(a), col.orden(b));
      if (r !== 0) return r * signo;
    }
    return a.id - b.id;
  });
}

/** Ciclo al hacer clic en un encabezado: ascendente → descendente → sin orden */
export function siguienteDireccion(actual: Direccion | undefined): Direccion | undefined {
  if (actual === undefined) return 'asc';
  return actual === 'asc' ? 'desc' : undefined;
}

/**
 * Qué pasa con la lista de criterios al hacer clic en una columna.
 * - Clic normal: esa columna pasa a ser el único criterio (o recorre asc → desc → quitar).
 * - Mayús + clic (`agregar`): se añade como criterio adicional, o recorre su dirección.
 */
export function alternarCriterio(
  criterios: readonly CriterioOrden[],
  clave: string,
  agregar: boolean,
): CriterioOrden[] {
  const actual = criterios.find((c) => c.clave === clave)?.direccion;
  const nueva = siguienteDireccion(actual);

  if (agregar) {
    if (actual === undefined) return [...criterios, { clave, direccion: 'asc' }];
    return nueva
      ? criterios.map((c) => (c.clave === clave ? { clave, direccion: nueva } : c))
      : criterios.filter((c) => c.clave !== clave);
  }

  // Clic normal: si había otros criterios, esta columna empieza de cero (ascendente)
  const soloEsta = criterios.length === 1 && actual !== undefined;
  const dir = soloEsta ? nueva : 'asc';
  return dir ? [{ clave, direccion: dir }] : [];
}

// ---------- Paginación ----------

export function totalPaginas(total: number, tamanio: number): number {
  return Math.max(1, Math.ceil(total / tamanio));
}

/** Registros de la página (empieza en 1) */
export function paginar<T>(datos: readonly T[], pagina: number, tamanio: number): T[] {
  const inicio = (pagina - 1) * tamanio;
  return datos.slice(inicio, inicio + tamanio);
}

/** Números de página a mostrar, con "…" cuando se salta: 1 … 4 5 6 … 20 */
export function ventanaPaginas(actual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const paginas = new Set([1, total, actual - 1, actual, actual + 1]);
  if (actual <= 3) [2, 3, 4].forEach((p) => paginas.add(p));
  if (actual >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => paginas.add(p));
  const ordenadas = [...paginas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const resultado: (number | '…')[] = [];
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - ordenadas[i - 1] > 1) resultado.push('…');
    resultado.push(p);
  });
  return resultado;
}
