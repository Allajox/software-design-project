import { LIMITE_ARCHIVO_MB } from './errores-api';
import { CargaApi, FuenteApi, ReporteCalidadApi, ResultadoCargaApi } from './modelos-api';

export interface FuenteInfo {
  valor: FuenteApi;
  titulo: string;
  descripcion: string;
  /** Motivo por el que todavía no se puede cargar (perfil deshabilitado en el backend); undefined = disponible */
  pendiente?: string;
}

/**
 * Fuentes de datos y su estado según los perfiles del backend (resources/ingestion/profiles/*.yml).
 * COSEVI e INEC tienen perfil habilitado. MOPT e IMN están deshabilitados porque aportan red vial y clima (no
 * siniestros) y todavía no existe una tabla donde guardarlos: cargarlos hoy no tiene efecto, así que no se ofrecen.
 * Un solo perfil COSEVI no basta: hay dos archivos (siniestros y personas); el servidor distingue cuál es por sus columnas.
 */
export const FUENTES_API: readonly FuenteInfo[] = [
  {
    valor: 'COSEVI',
    titulo: 'COSEVI',
    descripcion: 'Accidentes con víctimas: base de siniestros o base de personas. El servidor reconoce cuál es por las columnas.',
  },
  {
    valor: 'INEC',
    titulo: 'INEC',
    descripcion: 'Defunciones por accidentes de transporte.',
  },
  {
    valor: 'MOPT',
    titulo: 'MOPT (SNIT)',
    descripcion: 'Red vial en GeoJSON.',
    pendiente: 'Pendiente: aún no hay dónde guardar la red vial.',
  },
  {
    valor: 'IMN',
    titulo: 'IMN (Open-Meteo)',
    descripcion: 'Clima horario por cantón.',
    pendiente: 'Pendiente: aún no hay dónde guardar el clima.',
  },
];

/** Formatos que acepta el servidor: CSV, JSON/GeoJSON y Excel moderno (.xlsx). */
export const EXTENSIONES_ACEPTADAS = ['.csv', '.json', '.geojson', '.xlsx'] as const;
export const ACEPTAR_ARCHIVOS = EXTENSIONES_ACEPTADAS.join(',');

/** Revisa el archivo antes de subirlo para no hacer esperar a la persona por algo que el servidor rechazaría igual. */
export function validarArchivoParaSubir(nombre: string, bytes: number): string | null {
  const n = nombre.toLowerCase();
  if (bytes === 0) return 'El archivo está vacío.';
  if (n.endsWith('.xls')) return 'El formato Excel antiguo (.xls) no está soportado; guárdelo como .xlsx.';
  if (!EXTENSIONES_ACEPTADAS.some((e) => n.endsWith(e))) {
    return 'Formato no soportado. Se aceptan CSV, JSON (o GeoJSON) y Excel (.xlsx).';
  }
  if (bytes > LIMITE_ARCHIVO_MB * 1024 * 1024) return `El archivo supera el máximo de ${LIMITE_ARCHIVO_MB} MB.`;
  return null;
}

export const TITULO_RESULTADO: Record<ResultadoCargaApi, string> = {
  EXITOSA: 'Carga exitosa',
  PARCIAL: 'Carga parcial',
  FALLIDA: 'La carga falló',
};

/** Símbolo que acompaña al color del resultado (el color nunca va solo). */
export const SIMBOLO_RESULTADO: Record<ResultadoCargaApi, string> = { EXITOSA: '✓', PARCIAL: '!', FALLIDA: '✕' };

/** Filas que el servidor evaluó (válidas + incompletas + corruptas); no cuenta las omitidas por el perfil. */
export function totalEvaluadas(c: { validos: number; incompletos: number; corruptos: number }): number {
  return c.validos + c.incompletos + c.corruptos;
}

/** Porcentaje de filas evaluadas que quedaron como válidas (0 si no se evaluó ninguna). */
export function porcentajeValidas(c: { validos: number; incompletos: number; corruptos: number }): number {
  const total = totalEvaluadas(c);
  return total === 0 ? 0 : (c.validos / total) * 100;
}

/** El servidor guarda solo los primeros errores; los contadores siempre son exactos. */
export function erroresRecortados(r: ReporteCalidadApi): boolean {
  return r.errores.length < r.incompletos + r.corruptos;
}

/** ¿La carga llegó a evaluar filas? Si no, no tiene reporte de calidad que mostrar. */
export function tieneReporte(c: CargaApi): boolean {
  return c.resumen !== null && totalEvaluadas(c.resumen) + c.resumen.omitidos > 0;
}

/** CSV de los errores del reporte (una fila por error; solo el motivo y la fila, el servidor no guarda el contenido de las celdas). */
export function erroresACsv(r: ReporteCalidadApi): string {
  const celda = (t: string) => `"${t.replace(/"/g, '""')}"`;
  return ['Detalle', ...r.errores.map(celda)].join('\r\n');
}
