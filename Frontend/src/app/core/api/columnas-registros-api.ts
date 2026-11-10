import { CampoOrden } from './registros-api.service';
import {
  CALZADAS_API, CLIMAS_API, DIAS_API, FRANJAS_API, MESES_API, PROVINCIAS_API, SEVERIDADES_API, etiquetaDe,
} from './etiquetas-api';
import { SiniestroApi } from './modelos-api';

export interface ColumnaApi {
  clave: string;
  titulo: string;
  /** Campo del backend por el que se puede ordenar; undefined = el servidor no ordena por esta columna */
  orden?: CampoOrden;
  alinear?: 'der';
  texto: (s: SiniestroApi) => string;
}

const num = (n: number | null): string => (n === null || n === undefined ? '—' : String(n));
const txt = (t: string | null): string => (t && t.trim() ? t : '—');

/**
 * Columnas de la tabla de registros: solo las que COSEVI trae. No están el tipo de vehículo, la fecha exacta, las
 * coordenadas, el tiempo de respuesta ni la cantidad de fallecidos porque la fuente no los entrega (el backend los
 * devuelve null); mostrarlos como columna vacía o inventarlos sería engañoso.
 */
export const COLUMNAS_API: readonly ColumnaApi[] = [
  { clave: 'anio', titulo: 'Año', orden: 'anio', alinear: 'der', texto: (s) => num(s.anio) },
  { clave: 'mes', titulo: 'Mes', orden: 'mes', texto: (s) => etiquetaDe(MESES_API, s.mes) },
  { clave: 'diaSemana', titulo: 'Día', texto: (s) => etiquetaDe(DIAS_API, s.diaSemana) },
  { clave: 'franja', titulo: 'Franja', texto: (s) => etiquetaDe(FRANJAS_API, s.franja) },
  { clave: 'provincia', titulo: 'Provincia', orden: 'provincia', texto: (s) => etiquetaDe(PROVINCIAS_API, s.provincia) },
  { clave: 'canton', titulo: 'Cantón', orden: 'canton', texto: (s) => txt(s.canton) },
  { clave: 'distrito', titulo: 'Distrito', orden: 'distrito', texto: (s) => txt(s.distrito) },
  { clave: 'ruta', titulo: 'Ruta', orden: 'ruta', texto: (s) => txt(s.ruta) },
  { clave: 'km', titulo: 'Km', alinear: 'der', texto: (s) => num(s.km) },
  { clave: 'severidad', titulo: 'Severidad', orden: 'severidad', texto: (s) => etiquetaDe(SEVERIDADES_API, s.severidad) },
  { clave: 'clima', titulo: 'Clima', orden: 'clima', texto: (s) => etiquetaDe(CLIMAS_API, s.clima) },
  { clave: 'calzada', titulo: 'Calzada', orden: 'calzada', texto: (s) => etiquetaDe(CALZADAS_API, s.calzada) },
];

/** Siguiente orden al hacer clic en un encabezado: ascendente → descendente → el orden por defecto del servidor. */
export function siguienteOrden(
  actual: { campo: CampoOrden; direccion: 'asc' | 'desc' } | null,
  campo: CampoOrden,
): { campo: CampoOrden; direccion: 'asc' | 'desc' } | null {
  if (!actual || actual.campo !== campo) return { campo, direccion: 'asc' };
  return actual.direccion === 'asc' ? { campo, direccion: 'desc' } : null;
}
