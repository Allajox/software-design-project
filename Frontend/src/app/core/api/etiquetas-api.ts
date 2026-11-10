import { CriteriosApi } from './modelos-api';

/** Opción de una lista desplegable: `valor` es lo que entiende el backend; `texto`, lo que lee la persona. */
export interface OpcionApi {
  valor: string;
  texto: string;
}

export const PROVINCIAS_API: readonly OpcionApi[] = [
  { valor: 'SAN_JOSE', texto: 'San José' },
  { valor: 'ALAJUELA', texto: 'Alajuela' },
  { valor: 'CARTAGO', texto: 'Cartago' },
  { valor: 'HEREDIA', texto: 'Heredia' },
  { valor: 'GUANACASTE', texto: 'Guanacaste' },
  { valor: 'PUNTARENAS', texto: 'Puntarenas' },
  { valor: 'LIMON', texto: 'Limón' },
];

export const MESES_API: readonly OpcionApi[] = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
].map((texto, i) => ({ valor: String(i + 1), texto }));

export const DIAS_API: readonly OpcionApi[] = [
  { valor: 'LUNES', texto: 'Lunes' },
  { valor: 'MARTES', texto: 'Martes' },
  { valor: 'MIERCOLES', texto: 'Miércoles' },
  { valor: 'JUEVES', texto: 'Jueves' },
  { valor: 'VIERNES', texto: 'Viernes' },
  { valor: 'SABADO', texto: 'Sábado' },
  { valor: 'DOMINGO', texto: 'Domingo' },
];

export const FRANJAS_API: readonly OpcionApi[] = [
  { valor: 'MADRUGADA', texto: 'Madrugada' },
  { valor: 'MANANA', texto: 'Mañana' },
  { valor: 'TARDE', texto: 'Tarde' },
  { valor: 'NOCHE', texto: 'Noche' },
];

/** COSEVI solo clasifica la gravedad en dos niveles; «Fallecido» existe en el backend pero llega de otra fuente (INEC). */
export const SEVERIDADES_API: readonly OpcionApi[] = [
  { valor: 'SOLO_HERIDOS_LEVES', texto: 'Solo heridos leves' },
  { valor: 'CON_MUERTOS_O_GRAVES', texto: 'Con muertos o graves' },
  { valor: 'FALLECIDO', texto: 'Fallecido (INEC)' },
];

export const CLIMAS_API: readonly OpcionApi[] = [
  { valor: 'BUEN_TIEMPO', texto: 'Buen tiempo' },
  { valor: 'LLUVIA', texto: 'Lluvia' },
  { valor: 'NEBLINA', texto: 'Neblina' },
  { valor: 'LLUVIA_CON_NEBLINA', texto: 'Lluvia con neblina' },
];

export const CALZADAS_API: readonly OpcionApi[] = [
  { valor: 'BUENA', texto: 'Buena' },
  { valor: 'HUECOS', texto: 'Con huecos' },
  { valor: 'RESBALADIZA', texto: 'Resbaladiza' },
  { valor: 'CONSTRUCCION_O_REPARACION', texto: 'En construcción o reparación' },
  { valor: 'HUNDIMIENTOS', texto: 'Con hundimientos' },
  { valor: 'OTROS', texto: 'Otros' },
];

/** Texto de un valor del backend; si no está en la lista (valor nuevo del servidor) se muestra tal cual, sin esconderlo. */
export function etiquetaDe(opciones: readonly OpcionApi[], valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return opciones.find((o) => o.valor === String(valor))?.texto ?? String(valor);
}

/** Frases cortas con los criterios activos (para chips, historial y el cuadro de «guardar consulta»). */
export function resumirCriterios(c: CriteriosApi): string[] {
  const f: string[] = [];
  if (c.provincia) f.push(`Provincia: ${etiquetaDe(PROVINCIAS_API, c.provincia)}`);
  if (c.canton) f.push(`Cantón: ${c.canton}`);
  if (c.distrito) f.push(`Distrito: ${c.distrito}`);
  if (c.ruta) f.push(`Ruta: ${c.ruta}`);
  if (c.anio) f.push(`Año: ${c.anio}`);
  if (c.mes) f.push(`Mes: ${etiquetaDe(MESES_API, c.mes)}`);
  if (c.diaSemana) f.push(`Día: ${etiquetaDe(DIAS_API, c.diaSemana)}`);
  if (c.franja) f.push(`Franja: ${etiquetaDe(FRANJAS_API, c.franja)}`);
  if (c.severidad) f.push(`Severidad: ${etiquetaDe(SEVERIDADES_API, c.severidad)}`);
  if (c.clima) f.push(`Clima: ${etiquetaDe(CLIMAS_API, c.clima)}`);
  if (c.calzada) f.push(`Calzada: ${etiquetaDe(CALZADAS_API, c.calzada)}`);
  return f;
}
