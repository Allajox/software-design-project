import { RUTAS, UBICACIONES, Provincia } from '../models/catalogos';
import { CATALOGO_DE, SINONIMOS } from './esquema';
import { claveValor } from './normalizar';

/**
 * Conversión de celdas sueltas (texto, número, fecha de Excel…) a los tipos del sistema.
 * Cada función devuelve null cuando el valor no sirve; quien las llama decide el mensaje.
 */

export const celdaVacia = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Texto de una celda para mostrarlo en el reporte (recortado) */
export function aTexto(v: unknown, max = 60): string {
  if (v === undefined || v === null) return '';
  let t: string;
  if (v instanceof Date) t = Number.isNaN(v.getTime()) ? 'fecha inválida' : v.toISOString().slice(0, 16).replace('T', ' ');
  else if (typeof v === 'object') t = JSON.stringify(v);
  else t = String(v);
  t = t.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ---------- Números ----------

/**
 * Acepta 12, "12", "9,93" (coma decimal, la usual en Costa Rica), "9.93" y "1.234,5" / "1,234.5".
 * Espacios (incluido el espacio duro) como separador de miles se ignoran. Nunca devuelve NaN ni infinito.
 */
export function parsearNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.replace(/[\s ]/g, '');
  if (!/^[+-]?(\d+[.,]?\d*|[.,]\d+)([.,]\d+)*$/.test(t)) return null;
  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // los dos aparecen: el último es el decimal y el otro separa miles
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    t = t.split(decimal === ',' ? '.' : ',').join('');
    t = t.replace(decimal, '.');
  } else if (ultimaComa >= 0) {
    if ((t.match(/,/g) ?? []).length > 1) return null; // 1,234,567 es ambiguo con coma decimal
    t = t.replace(',', '.');
  } else if ((t.match(/\./g) ?? []).length > 1) {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parsearEntero(v: unknown): number | null {
  const n = parsearNumero(v);
  return n !== null && Number.isInteger(n) ? n : null;
}

const VERDADERO = new Set(['si', 's', 'true', 'verdadero', 'yes', 'y', '1', 'presente', 'con senalizacion', 'con']);
const FALSO = new Set(['no', 'n', 'false', 'falso', '0', 'ausente', 'sin senalizacion', 'sin']);

export function parsearBooleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const k = claveValor(v);
  return VERDADERO.has(k) ? true : FALSO.has(k) ? false : null;
}

// ---------- Fecha y hora ----------

export interface FechaLeida {
  anio: number;
  mes: number;
  dia: number;
  /** Solo si la celda traía hora */
  hora?: number;
}

const existeEnCalendario = (a: number, m: number, d: number): boolean => {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

const HORA_RE = '(?:[T\\s]+(\\d{1,2}):(\\d{2})(?::\\d{2}(?:\\.\\d+)?)?\\s*(?:Z|[+-]\\d{2}:?\\d{2})?)?';
const ISO_RE = new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${HORA_RE}$`);
const DMA_RE = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})${HORA_RE}$`);

export type ResultadoFecha = { ok: true; fecha: FechaLeida } | { ok: false; motivo: 'formato' | 'calendario' };

/** Fechas AAAA-MM-DD o DD/MM/AAAA (con hora opcional) y las fechas de Excel (objetos Date) */
export function parsearFecha(v: unknown): ResultadoFecha {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ok: false, motivo: 'formato' };
    // read-excel-file entrega las fechas en UTC
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    return { ok: true, fecha: { anio: v.getUTCFullYear(), mes: v.getUTCMonth() + 1, dia: v.getUTCDate(), hora: h || m ? h : undefined } };
  }
  if (typeof v !== 'string') return { ok: false, motivo: 'formato' };
  const t = v.trim();
  let anio: number, mes: number, dia: number, hora: string | undefined;
  let m = ISO_RE.exec(t);
  if (m) {
    [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    hora = m[4];
  } else if ((m = DMA_RE.exec(t))) {
    [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
    hora = m[4];
  } else return { ok: false, motivo: 'formato' };
  if (!existeEnCalendario(anio, mes, dia)) return { ok: false, motivo: 'calendario' };
  const h = hora === undefined ? undefined : Number(hora);
  if (h !== undefined && h > 23) return { ok: false, motivo: 'formato' };
  return { ok: true, fecha: { anio, mes, dia, hora: h } };
}

/** "07:45", "7:45:10", "7" o el número 7 → 7. Devuelve la hora (0–23) o null */
export function parsearHora(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 23 ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getUTCHours();
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2})(?::(\d{2})(?::\d{2})?)?$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  return h <= 23 && min <= 59 ? h : null;
}

/** Madrugada 00:00–05:59 · Mañana 06:00–11:59 · Tarde 12:00–17:59 · Noche 18:00–23:59 */
export function franjaDeHora(hora: number): 'Madrugada' | 'Mañana' | 'Tarde' | 'Noche' {
  return hora < 6 ? 'Madrugada' : hora < 12 ? 'Mañana' : hora < 18 ? 'Tarde' : 'Noche';
}

// ---------- Catálogos ----------

/** Valor canónico del catálogo para lo que escribió la persona, o null si no se reconoce */
export function resolverCatalogo(campo: string, v: unknown): string | null {
  const mapa = SINONIMOS[campo];
  return mapa?.[claveValor(v)] ?? null;
}

export const opcionesDe = (campo: string): readonly string[] => CATALOGO_DE[campo] ?? [];

/** "Ruta 27", "27", "ruta27", "RN-27", "Ruta nacional 27" → "Ruta 27" (si existe en el catálogo) */
export function resolverRuta(v: unknown): { texto: string | null; enCatalogo: boolean } {
  const m = /^(?:ruta|rn|r|cr)?[\s-]*(?:nacional)?[\s-]*0*(\d{1,3})$/.exec(claveValor(typeof v === 'number' ? `ruta ${v}` : v));
  if (!m) return { texto: null, enCatalogo: false };
  const texto = `Ruta ${Number(m[1])}`;
  return { texto, enCatalogo: (RUTAS as readonly string[]).includes(texto) };
}

/** Edad escrita como rango ("26 - 40", "60+", "mas de 60") o como número de años → rango del sistema */
export function resolverEdad(v: unknown): { rango: '18-25' | '26-40' | '41-60' | '>60' | null; menorDeEdad?: boolean } {
  if (typeof v === 'number' || /^\d{1,3}$/.test(String(v ?? '').trim())) {
    const n = Number(v);
    if (n < 18) return { rango: null, menorDeEdad: true };
    return { rango: n <= 25 ? '18-25' : n <= 40 ? '26-40' : n <= 60 ? '41-60' : '>60' };
  }
  const k = claveValor(v).replace(/[–—]/g, '-').replace(/(\d)\s*(?:a|-)\s*(\d)/g, '$1-$2').replace(/\s+/g, ' ');
  if (k === '18-25') return { rango: '18-25' };
  if (k === '26-40') return { rango: '26-40' };
  if (k === '41-60') return { rango: '41-60' };
  if (['>60', '60+', '61+', 'mas de 60', '>=61', '61 o mas', '61-mas'].includes(k)) return { rango: '>60' };
  return { rango: null };
}

/** Busca cantón (y distrito) en el catálogo de referencia sin importar tildes ni mayúsculas */
export function resolverCanton(provincia: Provincia, canton: string): string | null {
  const k = claveValor(canton);
  return Object.keys(UBICACIONES[provincia]).find((c) => claveValor(c) === k) ?? null;
}

export function resolverDistrito(provincia: Provincia, canton: string, distrito: string): string | null {
  const k = claveValor(distrito);
  return (UBICACIONES[provincia][canton] ?? []).find((d) => claveValor(d) === k) ?? null;
}
