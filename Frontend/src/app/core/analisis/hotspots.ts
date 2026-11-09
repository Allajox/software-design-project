import { ANIOS, CALZADAS_ADVERSAS, CLIMAS_ADVERSOS, DIAS, FRANJAS, Ruta, VEHICULOS } from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';
import { PESOS_SEVERIDAD, calcularISS } from '../services/kpi.calculator';

/**
 * Detección automática de hotspots (RF-6): tramos de carretera donde los siniestros se
 * concentran MÁS de lo que se esperaría por pura casualidad.
 *
 * Todo es puro (lista de siniestros + parámetros → resultado), sin Angular, así se puede probar
 * y se podría mover al backend sin cambios de fondo.
 *
 * Idea en cuatro pasos (se explica en la pantalla en lenguaje sencillo):
 *  1. Por cada ruta se desliza una «ventana» de N km y se cuentan los siniestros en cada posición.
 *  2. Se calcula cuántos habría en esa ventana si los siniestros de la ruta se repartieran parejo
 *     (el valor «esperado») y la probabilidad de que el azar produzca tanto o más (cola de Poisson).
 *  3. Se corrige por la cantidad de ventanas revisadas (Bonferroni): al revisar cientos de tramos,
 *     alguno saldría «raro» por suerte; esto evita falsas alarmas.
 *  4. Las ventanas que pasan se unen si se tocan, y cada tramo resultante se describe: gravedad,
 *     horas, días, vehículos y condiciones donde se concentra.
 */

// ---------------------------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------------------------

export interface ParametrosHotspots {
  /** Largo de la ventana que se desliza por la ruta, en km */
  longitudTramoKm: number;
  /** Mínimo de siniestros que debe tener un tramo para considerarlo */
  minimoSiniestros: number;
  /**
   * Probabilidad máxima aceptada de que el tramo sea casualidad, para TODA la búsqueda (no por
   * ventana): 0,01 significa «a lo sumo 1 % de riesgo de marcar un tramo normal».
   */
  alfa: number;
}

export const PARAMETROS_HOTSPOTS: ParametrosHotspots = {
  longitudTramoKm: 3,
  minimoSiniestros: 10,
  alfa: 0.01,
};

export const LONGITUDES_TRAMO_KM = [1, 2, 3, 5, 10] as const;
export const MINIMOS_SINIESTROS = [5, 10, 20, 30] as const;
export const NIVELES_ALFA = [
  { alfa: 0.05, texto: 'Flexible' },
  { alfa: 0.01, texto: 'Estándar' },
  { alfa: 0.001, texto: 'Estricta' },
] as const;

/** Para llamar «Crítico» o «Alto» a un tramo se compara su gravedad con la del tramo más grave de la lista */
export const UMBRAL_CRITICO = 0.6;
export const UMBRAL_ALTO = 0.3;
/** Una pista (hora, día, vehículo…) solo se muestra si hay al menos esta cantidad de casos y es muy poco probable por azar */
const MIN_CASOS_HALLAZGO = 5;
const P_HALLAZGO = 0.001;
const RAZON_MINIMA_HALLAZGO = 1.5;
const MAX_HALLAZGOS = 5;

export function normalizarParametros(p: ParametrosHotspots): ParametrosHotspots {
  const entero = (n: number, min: number, max: number, defecto: number) =>
    Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : defecto;
  return {
    longitudTramoKm: entero(p.longitudTramoKm, 1, 50, PARAMETROS_HOTSPOTS.longitudTramoKm),
    minimoSiniestros: entero(p.minimoSiniestros, 3, 10_000, PARAMETROS_HOTSPOTS.minimoSiniestros),
    alfa: Number.isFinite(p.alfa) && p.alfa > 0 && p.alfa < 1 ? p.alfa : PARAMETROS_HOTSPOTS.alfa,
  };
}

// ---------------------------------------------------------------------------------------------
// Estadística (sin librerías)
// ---------------------------------------------------------------------------------------------

const logFact: number[] = [0];
function logFactorial(n: number): number {
  for (let i = logFact.length; i <= n; i++) logFact.push(logFact[i - 1] + Math.log(i));
  return logFact[n];
}

/**
 * P(X ≥ k) cuando X sigue una distribución de Poisson de media `lambda`: la probabilidad de ver
 * k o más siniestros en un tramo donde se esperaban `lambda`. Se suma la cola directamente
 * (no 1 − acumulada) para no perder precisión con probabilidades diminutas.
 */
export function poissonCola(k: number, lambda: number): number {
  if (k <= 0) return 1;
  if (!(lambda > 0)) return 0;
  const logL = Math.log(lambda);
  const pmf = (i: number) => Math.exp(i * logL - lambda - logFactorial(i));

  if (k <= lambda) {
    let suma = 0;
    for (let i = 0; i < k; i++) suma += pmf(i);
    return Math.min(1, Math.max(0, 1 - suma));
  }
  let suma = 0;
  for (let i = k; i < k + 100_000; i++) {
    const termino = pmf(i);
    suma += termino;
    if (termino === 0 || termino < suma * 1e-16) break;
  }
  return Math.min(1, suma);
}

/** P(X ≥ k) para X binomial(n, p): probabilidad de que k o más de n casos tengan una característica que tiene probabilidad p */
export function binomialCola(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n || p <= 0) return 0;
  if (p >= 1) return 1;
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  let suma = 0;
  for (let i = k; i <= n; i++) {
    suma += Math.exp(logFactorial(n) - logFactorial(i) - logFactorial(n - i) + i * lp + (n - i) * lq);
  }
  return Math.min(1, suma);
}

// ---------------------------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------------------------

export type NivelRiesgo = 'critico' | 'alto' | 'moderado';

export interface Hallazgo {
  /** dimensión: franja, dia, vehiculo, anio, clima, senalizacion, letalidad */
  clave: string;
  /** nombre corto para mostrar como etiqueta */
  etiqueta: string;
  texto: string;
  /** veces que el tramo supera al conjunto en esta característica */
  razon: number;
  /** probabilidad de que sea casualidad */
  p: number;
}

export interface MatrizTramo {
  dias: readonly string[];
  franjas: readonly string[];
  /** valores[dia][franja] */
  valores: number[][];
  maximo: number;
}

export interface Hotspot {
  /** p. ej. «Ruta-27_36-40» */
  id: string;
  ruta: Ruta;
  kmInicio: number;
  kmFin: number;
  provincia: string;
  /** cantones más frecuentes (hasta 3) */
  cantones: string[];

  siniestros: number;
  /** cuántos se esperaban en ese largo si la ruta fuese pareja */
  esperados: number;
  /** siniestros ÷ esperados */
  razon: number;
  /** probabilidad de que sea casualidad, ya corregida por la cantidad de tramos revisados (0-1) */
  pAjustado: number;

  fallecidos: number;
  heridosGraves: number;
  heridosLeves: number;
  victimas: number;
  siniestrosConFallecidos: number;
  /** W1·fallecidos + W2·graves + W3·leves de todo el tramo */
  severidadAcumulada: number;
  /** Índice de severidad (ISS) del tramo: severidad acumulada ÷ siniestros */
  iss: number;
  nivel: NivelRiesgo;

  porFranja: Record<string, number>;
  porDia: Record<string, number>;
  porAnio: Record<string, number>;
  matriz: MatrizTramo;
  hallazgos: Hallazgo[];

  registros: readonly Siniestro[];
}

export interface PerfilRuta {
  ruta: Ruta;
  total: number;
  kmMin: number;
  kmMax: number;
  /** siniestros por kilómetro, desde kmMin */
  conteos: number[];
  /** ¿tenía suficientes siniestros para ser analizada? */
  analizada: boolean;
}

export interface ResultadoHotspots {
  parametros: ParametrosHotspots;
  hotspots: Hotspot[];
  perfilRutas: PerfilRuta[];
  siniestrosAnalizados: number;
  /** registros sin kilómetro válido, que no se pueden ubicar en la ruta */
  sinKilometro: number;
  siniestrosEnHotspots: number;
  porcentajeEnHotspots: number;
  kmEnHotspots: number;
  /** kilómetros que cubren los siniestros de las rutas analizadas (de su primer a su último km con datos) */
  kmObservados: number;
  fallecidosAnalizados: number;
  fallecidosEnHotspots: number;
  /** cantidad de ventanas revisadas en toda la búsqueda */
  tramosEvaluados: number;
  /** probabilidad máxima por ventana tras la corrección */
  alfaPorTramo: number;
  kmTope: number;
}

// ---------------------------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------------------------

const kmEntero = (s: Siniestro): number => Math.floor(s.kilometro);
const kmValido = (s: Siniestro): boolean => Number.isFinite(s.kilometro) && s.kilometro >= 0;

function contar<T>(registros: readonly Siniestro[], clave: (s: Siniestro) => T | null): Map<T, number> {
  const mapa = new Map<T, number>();
  for (const s of registros) {
    const k = clave(s);
    if (k !== null) mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return mapa;
}

function masFrecuentes(registros: readonly Siniestro[], clave: (s: Siniestro) => string, max: number): string[] {
  return [...contar(registros, clave)]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, max)
    .map(([valor]) => valor);
}

const sumar = (registros: readonly Siniestro[], f: (s: Siniestro) => number): number =>
  registros.reduce((total, s) => total + f(s), 0);

const severidadDe = (s: Siniestro): number =>
  PESOS_SEVERIDAD.w1Fallecidos * s.fallecidos + PESOS_SEVERIDAD.w2Graves * s.heridosGraves + PESOS_SEVERIDAD.w3Leves * s.heridosLeves;

interface Ventana {
  ini: number;
  fin: number;
  p: number;
}

/** Une las ventanas que se solapan o se tocan en un solo tramo */
function unirVentanas(ventanas: readonly Ventana[]): Ventana[] {
  const unidas: Ventana[] = [];
  for (const v of ventanas) {
    const ultima = unidas[unidas.length - 1];
    if (ultima && v.ini <= ultima.fin + 1) {
      ultima.fin = Math.max(ultima.fin, v.fin);
      ultima.p = Math.min(ultima.p, v.p);
    } else unidas.push({ ...v });
  }
  return unidas;
}

// ----- Pistas: ¿en qué se parece lo que pasa en el tramo y en qué se diferencia del resto? -----

interface Dimension {
  clave: string;
  etiqueta: string;
  /** categoría del siniestro en esta dimensión; null = no cuenta */
  categoria: (s: Siniestro) => string | null;
  frase: (categoria: string, parte: string, base: string) => string;
}

const plural = (dia: string): string => (dia.toLowerCase().endsWith('s') ? dia.toLowerCase() : `${dia.toLowerCase()}s`);

const DIMENSIONES: readonly Dimension[] = [
  {
    clave: 'franja',
    etiqueta: 'Horario',
    categoria: (s) => s.franja,
    frase: (c, parte, base) => `El ${parte} ocurre en la franja «${c}» (en el conjunto analizado, el ${base}).`,
  },
  {
    clave: 'dia',
    etiqueta: 'Día',
    categoria: (s) => s.diaSemana,
    frase: (c, parte, base) => `El ${parte} ocurre los ${plural(c)} (en el conjunto analizado, el ${base}).`,
  },
  {
    clave: 'vehiculo',
    etiqueta: 'Vehículo',
    categoria: (s) => s.vehiculo,
    frase: (c, parte, base) => `El ${parte} involucra «${c}» (en el conjunto analizado, el ${base}).`,
  },
  {
    clave: 'anio',
    etiqueta: 'Año',
    categoria: (s) => String(s.anio),
    frase: (c, parte, base) => `El ${parte} ocurrió en ${c} (en el conjunto analizado, el ${base}).`,
  },
  {
    clave: 'clima',
    etiqueta: 'Condiciones',
    categoria: (s) => (CLIMAS_ADVERSOS.includes(s.clima) || CALZADAS_ADVERSAS.includes(s.calzada) ? 'adversas' : null),
    frase: (_c, parte, base) => `El ${parte} ocurre con lluvia, neblina o derrumbe (en el conjunto analizado, el ${base}).`,
  },
  {
    clave: 'senalizacion',
    etiqueta: 'Señalización',
    categoria: (s) => (s.senalizacion ? null : 'ausente'),
    frase: (_c, parte, base) => `El ${parte} ocurre en un punto sin señalización (en el conjunto analizado, el ${base}).`,
  },
  {
    clave: 'letalidad',
    etiqueta: 'Letalidad',
    categoria: (s) => (s.fallecidos > 0 ? 'letal' : null),
    frase: (_c, parte, base) => `El ${parte} de los siniestros deja al menos un fallecido (en el conjunto analizado, el ${base}).`,
  },
];

const pctTexto = (x: number): string =>
  `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: x < 10 ? 1 : 0 }).format(x * 100)} %`;

type Base = Map<string, Map<string, number>>;

function construirBase(registros: readonly Siniestro[]): Base {
  const base: Base = new Map();
  for (const d of DIMENSIONES) base.set(d.clave, contar(registros, d.categoria));
  return base;
}

/** Busca, en cada dimensión, la característica que más se concentra en el tramo respecto al conjunto */
export function hallazgosDelTramo(tramo: readonly Siniestro[], base: Base, totalBase: number): Hallazgo[] {
  const n = tramo.length;
  const hallazgos: Hallazgo[] = [];
  if (n < MIN_CASOS_HALLAZGO || totalBase <= 0) return hallazgos;

  for (const d of DIMENSIONES) {
    const enBase = base.get(d.clave) ?? new Map<string, number>();
    let mejor: Hallazgo | null = null;
    for (const [categoria, k] of contar(tramo, d.categoria)) {
      const pBase = (enBase.get(categoria) ?? 0) / totalBase;
      if (k < MIN_CASOS_HALLAZGO || pBase <= 0) continue;
      const razon = k / n / pBase;
      if (razon < RAZON_MINIMA_HALLAZGO) continue;
      const p = binomialCola(n, k, pBase);
      if (p > P_HALLAZGO) continue;
      if (!mejor || p < mejor.p || (p === mejor.p && razon > mejor.razon)) {
        mejor = { clave: d.clave, etiqueta: d.etiqueta, texto: d.frase(categoria, pctTexto(k / n), pctTexto(pBase)), razon, p };
      }
    }
    if (mejor) hallazgos.push(mejor);
  }
  return hallazgos.sort((a, b) => a.p - b.p || b.razon - a.razon).slice(0, MAX_HALLAZGOS);
}

// ----- Función principal -----

export function detectarHotspots(
  registros: readonly Siniestro[],
  parametrosEntrada: ParametrosHotspots = PARAMETROS_HOTSPOTS,
): ResultadoHotspots {
  const parametros = normalizarParametros(parametrosEntrada);
  const ubicables = registros.filter(kmValido);

  const porRuta = new Map<Ruta, Siniestro[]>();
  for (const s of ubicables) {
    const lista = porRuta.get(s.ruta);
    if (lista) lista.push(s);
    else porRuta.set(s.ruta, [s]);
  }

  // Perfil por ruta (siniestros por km)
  interface Preparada {
    perfil: PerfilRuta;
    registros: Siniestro[];
    span: number;
    ventana: number;
  }
  const preparadas: Preparada[] = [];
  for (const [ruta, lista] of porRuta) {
    let kmMin = Infinity;
    let kmMax = -Infinity;
    for (const s of lista) {
      const km = kmEntero(s);
      if (km < kmMin) kmMin = km;
      if (km > kmMax) kmMax = km;
    }
    const span = kmMax - kmMin + 1;
    const conteos = new Array<number>(span).fill(0);
    for (const s of lista) conteos[kmEntero(s) - kmMin]++;
    preparadas.push({
      perfil: { ruta, total: lista.length, kmMin, kmMax, conteos, analizada: lista.length >= parametros.minimoSiniestros },
      registros: lista,
      span,
      ventana: Math.min(parametros.longitudTramoKm, span),
    });
  }
  preparadas.sort((a, b) => a.perfil.ruta.localeCompare(b.perfil.ruta, 'es', { numeric: true }));

  // Cantidad total de ventanas que se van a revisar (para la corrección por pruebas múltiples)
  const tramosEvaluados = preparadas
    .filter((p) => p.perfil.analizada)
    .reduce((total, p) => total + (p.span - p.ventana + 1), 0);
  const alfaPorTramo = parametros.alfa / Math.max(1, tramosEvaluados);

  const base = construirBase(ubicables);
  const brutos: Omit<Hotspot, 'nivel'>[] = [];

  for (const prep of preparadas) {
    if (!prep.perfil.analizada) continue;
    const { perfil, span, ventana } = prep;
    const total = perfil.total;
    const lambda = (total * ventana) / span;

    // sumas acumuladas para contar cualquier ventana en O(1)
    const acumulado = new Array<number>(span + 1).fill(0);
    for (let i = 0; i < span; i++) acumulado[i + 1] = acumulado[i] + perfil.conteos[i];

    const candidatas: Ventana[] = [];
    for (let ini = 0; ini + ventana <= span; ini++) {
      const c = acumulado[ini + ventana] - acumulado[ini];
      if (c < parametros.minimoSiniestros || c <= lambda) continue;
      const p = poissonCola(c, lambda);
      if (p <= alfaPorTramo) candidatas.push({ ini, fin: ini + ventana - 1, p });
    }

    for (const tramo of unirVentanas(candidatas)) {
      // se recorta a los kilómetros donde realmente hubo siniestros
      let ini = tramo.ini;
      let fin = tramo.fin;
      while (ini < fin && perfil.conteos[ini] === 0) ini++;
      while (fin > ini && perfil.conteos[fin] === 0) fin--;

      const kmInicio = perfil.kmMin + ini;
      const kmFin = perfil.kmMin + fin;
      const delTramo = prep.registros.filter((s) => {
        const km = kmEntero(s);
        return km >= kmInicio && km <= kmFin;
      });
      const n = delTramo.length;
      const esperados = (total * (fin - ini + 1)) / span;

      const fallecidos = sumar(delTramo, (s) => s.fallecidos);
      const heridosGraves = sumar(delTramo, (s) => s.heridosGraves);
      const heridosLeves = sumar(delTramo, (s) => s.heridosLeves);
      const severidadAcumulada = sumar(delTramo, severidadDe);

      const porFranja: Record<string, number> = Object.fromEntries(FRANJAS.map((f) => [f, 0]));
      const porDia: Record<string, number> = Object.fromEntries(DIAS.map((d) => [d, 0]));
      const porAnio: Record<string, number> = Object.fromEntries(ANIOS.map((a) => [String(a), 0]));
      const valores = DIAS.map(() => FRANJAS.map(() => 0));
      for (const s of delTramo) {
        porFranja[s.franja]++;
        porDia[s.diaSemana]++;
        porAnio[String(s.anio)] = (porAnio[String(s.anio)] ?? 0) + 1;
        valores[DIAS.indexOf(s.diaSemana)][FRANJAS.indexOf(s.franja)]++;
      }

      brutos.push({
        id: `${perfil.ruta.replace(/\s+/g, '-')}_${kmInicio}-${kmFin}`,
        ruta: perfil.ruta,
        kmInicio,
        kmFin,
        provincia: masFrecuentes(delTramo, (s) => s.provincia, 1)[0] ?? '',
        cantones: masFrecuentes(delTramo, (s) => s.canton, 3),
        siniestros: n,
        esperados,
        razon: esperados > 0 ? n / esperados : 0,
        pAjustado: Math.min(1, tramo.p * tramosEvaluados),
        fallecidos,
        heridosGraves,
        heridosLeves,
        victimas: fallecidos + heridosGraves + heridosLeves,
        siniestrosConFallecidos: delTramo.filter((s) => s.fallecidos > 0).length,
        severidadAcumulada,
        iss: calcularISS(delTramo),
        porFranja,
        porDia,
        porAnio,
        matriz: { dias: DIAS, franjas: FRANJAS, valores, maximo: Math.max(0, ...valores.flat()) },
        hallazgos: hallazgosDelTramo(delTramo, base, ubicables.length),
        registros: delTramo,
      });
    }
  }

  brutos.sort((a, b) => b.severidadAcumulada - a.severidadAcumulada || b.siniestros - a.siniestros || a.id.localeCompare(b.id));
  const maxSeveridad = brutos[0]?.severidadAcumulada ?? 0;
  const hotspots: Hotspot[] = brutos.map((h) => ({ ...h, nivel: nivelDe(h.severidadAcumulada, maxSeveridad) }));

  const siniestrosEnHotspots = hotspots.reduce((t, h) => t + h.siniestros, 0);
  return {
    parametros,
    hotspots,
    perfilRutas: preparadas.map((p) => p.perfil),
    siniestrosAnalizados: ubicables.length,
    sinKilometro: registros.length - ubicables.length,
    siniestrosEnHotspots,
    porcentajeEnHotspots: ubicables.length > 0 ? (siniestrosEnHotspots / ubicables.length) * 100 : 0,
    kmEnHotspots: hotspots.reduce((t, h) => t + (h.kmFin - h.kmInicio + 1), 0),
    kmObservados: preparadas.filter((p) => p.perfil.analizada).reduce((t, p) => t + p.span, 0),
    fallecidosAnalizados: sumar(ubicables, (x) => x.fallecidos),
    fallecidosEnHotspots: hotspots.reduce((t, h) => t + h.fallecidos, 0),
    tramosEvaluados,
    alfaPorTramo,
    kmTope: preparadas.reduce((max, p) => Math.max(max, p.perfil.kmMax), 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Utilidades para mostrar
// ---------------------------------------------------------------------------------------------

export function nivelDe(severidad: number, maxima: number): NivelRiesgo {
  if (maxima <= 0) return 'moderado';
  const relativa = severidad / maxima;
  return relativa >= UMBRAL_CRITICO ? 'critico' : relativa >= UMBRAL_ALTO ? 'alto' : 'moderado';
}

export const TEXTO_NIVEL: Record<NivelRiesgo, string> = { critico: 'Crítico', alto: 'Alto', moderado: 'Moderado' };

export function etiquetaTramo(h: Pick<Hotspot, 'ruta' | 'kmInicio' | 'kmFin'>): string {
  return h.kmInicio === h.kmFin ? `${h.ruta} · km ${h.kmInicio}` : `${h.ruta} · km ${h.kmInicio} a ${h.kmFin}`;
}

export type CriterioOrden = 'severidad' | 'siniestros' | 'fallecidos' | 'intensidad' | 'ruta';

export const CRITERIOS_ORDEN: readonly { valor: CriterioOrden; texto: string }[] = [
  { valor: 'severidad', texto: 'Gravedad acumulada' },
  { valor: 'siniestros', texto: 'Cantidad de siniestros' },
  { valor: 'fallecidos', texto: 'Fallecidos' },
  { valor: 'intensidad', texto: 'Veces lo esperado' },
  { valor: 'ruta', texto: 'Ruta y kilómetro' },
];

export function ordenarHotspots(hotspots: readonly Hotspot[], criterio: CriterioOrden): Hotspot[] {
  const copia = [...hotspots];
  const desempate = (a: Hotspot, b: Hotspot) => b.severidadAcumulada - a.severidadAcumulada || a.id.localeCompare(b.id);
  switch (criterio) {
    case 'siniestros':
      return copia.sort((a, b) => b.siniestros - a.siniestros || desempate(a, b));
    case 'fallecidos':
      return copia.sort((a, b) => b.fallecidos - a.fallecidos || desempate(a, b));
    case 'intensidad':
      return copia.sort((a, b) => b.razon - a.razon || desempate(a, b));
    case 'ruta':
      return copia.sort(
        (a, b) => a.ruta.localeCompare(b.ruta, 'es', { numeric: true }) || a.kmInicio - b.kmInicio,
      );
    default:
      return copia.sort(desempate);
  }
}

/**
 * Agrupa los siniestros por km de una ruta en bloques de `ancho` km, contados desde el km 0
 * (para dibujar la franja de densidad de la ruta en una escala común a todas las rutas).
 */
export function densidadPorBloque(perfil: PerfilRuta, ancho: number, kmTope: number): number[] {
  const bloques = new Array<number>(Math.ceil((kmTope + 1) / ancho)).fill(0);
  perfil.conteos.forEach((c, i) => {
    bloques[Math.floor((perfil.kmMin + i) / ancho)] += c;
  });
  return bloques;
}

/** Tabla del ranking lista para exportar (CSV, Excel…): una fila por hotspot */
export function hotspotsATabla(hotspots: readonly Hotspot[]): { columnas: string[]; filas: (string | number)[][] } {
  const redondear = (n: number, d = 1) => Number(n.toFixed(d));
  return {
    columnas: [
      'Puesto', 'Ruta', 'Km inicio', 'Km fin', 'Provincia', 'Cantones', 'Nivel', 'Siniestros', 'Esperados',
      'Veces lo esperado', 'Fallecidos', 'Heridos graves', 'Heridos leves', 'Gravedad acumulada', 'ISS',
      'Probabilidad de casualidad', 'Pistas',
    ],
    filas: hotspots.map((h, i) => [
      i + 1, h.ruta, h.kmInicio, h.kmFin, h.provincia, h.cantones.join(', '), TEXTO_NIVEL[h.nivel], h.siniestros,
      redondear(h.esperados), redondear(h.razon), h.fallecidos, h.heridosGraves, h.heridosLeves,
      h.severidadAcumulada, redondear(h.iss, 2), h.pAjustado < 1e-4 ? '< 0,0001' : redondear(h.pAjustado, 4).toString().replace('.', ','),
      h.hallazgos.map((x) => x.texto).join(' '),
    ]),
  };
}
