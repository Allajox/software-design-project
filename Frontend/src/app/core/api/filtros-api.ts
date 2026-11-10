import { CriteriosApi } from './modelos-api';
import {
  CALZADAS_API, CLIMAS_API, DIAS_API, FRANJAS_API, OpcionApi, PROVINCIAS_API, SEVERIDADES_API,
} from './etiquetas-api';

/**
 * Filtros de la pantalla de registros conectada al servidor. A diferencia del dashboard de demostración
 * (varios valores por filtro), el backend acepta UN valor por filtro: por eso aquí cada campo es simple.
 * Texto vacío o null = sin filtro.
 */
export interface FiltrosApi {
  provincia: string;
  canton: string;
  distrito: string;
  ruta: string;
  anio: number | null;
  mes: number | null;
  diaSemana: string;
  franja: string;
  severidad: string;
  clima: string;
  calzada: string;
}

export const ANIO_MIN = 1900;
export const ANIO_MAX = 2100;

export function filtrosApiVacios(): FiltrosApi {
  return {
    provincia: '', canton: '', distrito: '', ruta: '', anio: null, mes: null,
    diaSemana: '', franja: '', severidad: '', clima: '', calzada: '',
  };
}

const sinEspacios = (t: string): string => t.trim().replace(/\s+/g, ' ');

/** Cuerpo de POST /records/search y /queries/saved: solo lo que tiene valor (nada de 0 ni textos vacíos). */
export function aCriterios(f: FiltrosApi): CriteriosApi {
  const c: Record<string, string | number> = {};
  const texto = (clave: string, valor: string) => {
    const v = sinEspacios(valor);
    if (v) c[clave] = v;
  };
  texto('provincia', f.provincia);
  texto('canton', f.canton);
  texto('distrito', f.distrito);
  texto('ruta', f.ruta);
  if (f.anio !== null) c['anio'] = f.anio;
  if (f.mes !== null) c['mes'] = f.mes;
  texto('diaSemana', f.diaSemana);
  texto('franja', f.franja);
  texto('severidad', f.severidad);
  texto('clima', f.clima);
  texto('calzada', f.calzada);
  return c as CriteriosApi;
}

const delCatalogo = (opciones: readonly OpcionApi[], v: unknown): string =>
  typeof v === 'string' && opciones.some((o) => o.valor === v) ? v : '';

const textoLibre = (v: unknown): string => (typeof v === 'string' ? sinEspacios(v).slice(0, 80) : '');

const entero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v !== 0 ? v : null; // el backend manda 0 cuando no hay filtro

/**
 * Criterios que llegan del servidor (consulta guardada o historial) → filtros de la pantalla.
 * Lo que la pantalla no maneja (edad, género, tipo de vehículo) se descarta, y 0 se entiende como «sin filtro».
 */
export function desdeCriterios(c: CriteriosApi | null | undefined): FiltrosApi {
  const r = (c ?? {}) as Record<string, unknown>;
  const mes = entero(r['mes']);
  return {
    provincia: delCatalogo(PROVINCIAS_API, r['provincia']),
    canton: textoLibre(r['canton']),
    distrito: textoLibre(r['distrito']),
    ruta: textoLibre(r['ruta']),
    anio: entero(r['anio']),
    mes: mes !== null && mes >= 1 && mes <= 12 ? mes : null,
    diaSemana: delCatalogo(DIAS_API, r['diaSemana']),
    franja: delCatalogo(FRANJAS_API, r['franja']),
    severidad: delCatalogo(SEVERIDADES_API, r['severidad']),
    clima: delCatalogo(CLIMAS_API, r['clima']),
    calzada: delCatalogo(CALZADAS_API, r['calzada']),
  };
}

/** Cuántos filtros tienen valor. */
export function contarFiltrosActivos(f: FiltrosApi): number {
  return Object.keys(aCriterios(f)).length;
}

export function filtrosIguales(a: FiltrosApi, b: FiltrosApi): boolean {
  return JSON.stringify(aCriterios(a)) === JSON.stringify(aCriterios(b));
}

/** Lo que el servidor rechazaría, avisado antes de enviar. null = todo bien. */
export function validarFiltrosApi(f: FiltrosApi): string | null {
  if (f.anio !== null && (!Number.isInteger(f.anio) || f.anio < ANIO_MIN || f.anio > ANIO_MAX)) {
    return `El año debe estar entre ${ANIO_MIN} y ${ANIO_MAX}.`;
  }
  return null;
}

/** Lee el texto de un campo numérico: vacío o no numérico = sin filtro. */
export function enteroDeTexto(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  return Number(t);
}
