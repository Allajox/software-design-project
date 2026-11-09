import {
  ANIOS, CALZADAS, CLIMAS, DIAS, EDADES, FRANJAS, GENEROS, PROVINCIAS, RUTAS, SEVERIDADES, VEHICULOS,
} from '../models/catalogos';
import { AlmacenConsultas, ConsultaGuardada, ConsultaReciente } from '../models/consulta.models';
import { Filtros, filtrosVacios } from '../models/siniestro.models';

/** Cuántas consultas recientes se recuerdan; las más viejas se descartan */
export const MAX_RECIENTES = 30;
export const MAX_GUARDADAS = 50;
export const LARGO_MAX_NOMBRE = 60;

/**
 * Texto único para una combinación de filtros. Dos combinaciones iguales (aunque las opciones
 * se hayan marcado en otro orden) dan el mismo texto; así no se repite la misma consulta.
 */
export function claveFiltros(f: Filtros): string {
  const ordenado = (lista: readonly (string | number)[]) => [...lista].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify({
    ...f,
    anios: ordenado(f.anios), meses: ordenado(f.meses), dias: ordenado(f.dias), franjas: ordenado(f.franjas),
    vehiculos: ordenado(f.vehiculos), severidades: ordenado(f.severidades), climas: ordenado(f.climas),
    calzadas: ordenado(f.calzadas), edades: ordenado(f.edades), generos: ordenado(f.generos),
  });
}

// ---------- Datos que vienen del almacenamiento: nunca se confía en ellos ----------

const texto = (v: unknown, max = 60): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';

function lista<T extends string | number>(v: unknown, permitidos: readonly T[]): T[] {
  if (!Array.isArray(v)) return [];
  return permitidos.filter((p) => v.includes(p)); // se queda solo con valores del catálogo
}

/** Convierte lo que haya en el almacenamiento en unos filtros válidos (lo inválido se descarta) */
export function sanitizarFiltros(raw: unknown): Filtros {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const provincia = texto(r['provincia']);
  const ruta = texto(r['ruta']);
  return {
    ...filtrosVacios(),
    provincia: (PROVINCIAS as readonly string[]).includes(provincia) ? provincia : '',
    canton: texto(r['canton']),
    distrito: texto(r['distrito']),
    ruta: (RUTAS as readonly string[]).includes(ruta) ? ruta : '',
    anios: lista(r['anios'], ANIOS),
    meses: lista(r['meses'], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    dias: lista(r['dias'], DIAS),
    franjas: lista(r['franjas'], FRANJAS),
    vehiculos: lista(r['vehiculos'], VEHICULOS),
    severidades: lista(r['severidades'], SEVERIDADES),
    climas: lista(r['climas'], CLIMAS),
    calzadas: lista(r['calzadas'], CALZADAS),
    edades: lista(r['edades'], EDADES),
    generos: lista(r['generos'], GENEROS),
  };
}

const fechaValida = (v: unknown): string => {
  const s = typeof v === 'string' ? v : '';
  return Number.isNaN(Date.parse(s)) ? new Date(0).toISOString() : s;
};

export function sanitizarAlmacen(raw: unknown): AlmacenConsultas {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const guardadas = (Array.isArray(r['guardadas']) ? r['guardadas'] : [])
    .map((x): ConsultaGuardada | null => {
      const o = x as Record<string, unknown> | null;
      const nombre = texto(o?.['nombre'], LARGO_MAX_NOMBRE).trim();
      const id = texto(o?.['id'], 80);
      return o && nombre && id
        ? { id, nombre, filtros: sanitizarFiltros(o['filtros']), creadaEn: fechaValida(o['creadaEn']) }
        : null;
    })
    .filter((x): x is ConsultaGuardada => x !== null)
    .slice(0, MAX_GUARDADAS);

  const recientes = (Array.isArray(r['recientes']) ? r['recientes'] : [])
    .map((x): ConsultaReciente | null => {
      const o = x as Record<string, unknown> | null;
      const id = texto(o?.['id'], 80);
      return o && id ? { id, filtros: sanitizarFiltros(o['filtros']), fecha: fechaValida(o['fecha']) } : null;
    })
    .filter((x): x is ConsultaReciente => x !== null)
    .slice(0, MAX_RECIENTES);

  return { guardadas, recientes };
}

// ---------- Reglas del historial ----------

/**
 * Anota una consulta como reciente. Si la misma combinación ya estaba, se mueve al principio
 * (con la fecha nueva) en lugar de repetirse. Devuelve una lista nueva.
 */
export function agregarReciente(
  recientes: readonly ConsultaReciente[],
  filtros: Filtros,
  id: string,
  ahora: Date = new Date(),
): ConsultaReciente[] {
  const clave = claveFiltros(filtros);
  const sinRepetida = recientes.filter((r) => claveFiltros(r.filtros) !== clave);
  return [{ id, filtros, fecha: ahora.toISOString() }, ...sinRepetida].slice(0, MAX_RECIENTES);
}

/** @returns el mensaje de error, o null si el nombre es válido */
export function validarNombreConsulta(
  nombre: string,
  existentes: readonly ConsultaGuardada[],
  idExcluido?: string,
): string | null {
  const limpio = nombre.trim();
  if (limpio.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
  if (limpio.length > LARGO_MAX_NOMBRE) return `El nombre no puede pasar de ${LARGO_MAX_NOMBRE} caracteres.`;
  const repetido = existentes.some((c) => c.id !== idExcluido && c.nombre.toLowerCase() === limpio.toLowerCase());
  return repetido ? 'Ya existe una consulta guardada con ese nombre.' : null;
}

export function nuevoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
