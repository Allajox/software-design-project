import { FRANJAS, FranjaHoraria, Provincia } from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';
import { PESOS_SEVERIDAD, calcularISS, calcularTSV } from '../services/kpi.calculator';

/**
 * Simulador de escenarios «What-If» (RF-8): proyecta cuántos siniestros, heridos graves y fallecidos se
 * evitarían al año si se aplicara una medida preventiva en un tramo, una ruta, una provincia o todo el país.
 *
 * IMPORTANTE: los datos del sistema NO contienen ninguna medida aplicada (no hay registro de patrullajes ni de
 * obras de señalización con su fecha), así que el efecto real de una medida NO se puede deducir de ellos.
 * Lo que sí dicen los datos es CUÁNTOS siniestros están al alcance de cada medida (p. ej. cuántos ocurrieron
 * donde no había señalización). El efecto (el «% de reducción») es un supuesto que pone la persona, con un
 * rango (mínimo / central / máximo) para no aparentar una precisión que no existe.
 *
 * Todo es puro (datos + supuestos → números), sin Angular, para probarlo y moverlo al backend.
 */

// ---------------------------------------------------------------------------------------------
// Alcance: dónde se aplica la medida
// ---------------------------------------------------------------------------------------------

export interface Alcance {
  /** '' = todo el país */
  provincia: string;
  /** '' = todas las rutas */
  ruta: string;
  /** rango de kilómetros ENTEROS dentro de la ruta (ambos incluidos); null = sin límite. Solo cuenta si hay una ruta elegida */
  kmDesde: number | null;
  kmHasta: number | null;
}

export const ALCANCE_NACIONAL: Alcance = { provincia: '', ruta: '', kmDesde: null, kmHasta: null };

export const esAlcanceNacional = (a: Alcance): boolean =>
  !a.provincia && !a.ruta;

export function enAlcance(s: Siniestro, a: Alcance): boolean {
  if (a.provincia && s.provincia !== (a.provincia as Provincia)) return false;
  if (a.ruta) {
    if (s.ruta !== a.ruta) return false;
    // el kilómetro se cuenta entero, igual que en los hotspots: «km 40» incluye hasta el 40,99
    const km = Math.floor(s.kilometro);
    if (a.kmDesde !== null && km < a.kmDesde) return false;
    if (a.kmHasta !== null && km > a.kmHasta) return false;
  }
  return true;
}

/** «Ruta 27 · km 36 a 40 · San José» o «Todo el país» */
export function describirAlcance(a: Alcance): string {
  const partes: string[] = [];
  if (a.ruta) {
    partes.push(a.ruta);
    if (a.kmDesde !== null && a.kmHasta !== null) partes.push(`km ${a.kmDesde} a ${a.kmHasta}`);
    else if (a.kmDesde !== null) partes.push(`desde el km ${a.kmDesde}`);
    else if (a.kmHasta !== null) partes.push(`hasta el km ${a.kmHasta}`);
  }
  if (a.provincia) partes.push(a.provincia);
  return partes.length ? partes.join(' · ') : 'Todo el país';
}

// ---------------------------------------------------------------------------------------------
// Medidas y supuestos de efectividad
// ---------------------------------------------------------------------------------------------

/** Reducción de siniestros (en %, 0-100) donde la medida se aplica, con un rango de incertidumbre */
export interface Efecto {
  minimo: number;
  central: number;
  maximo: number;
}

export interface MedidaSenalizacion {
  activa: boolean;
  /** % de los puntos hoy SIN señalización que sí se mejoran (0-100) */
  cobertura: number;
  efecto: Efecto;
}

export interface MedidaPatrullaje {
  activa: boolean;
  /** franjas horarias en las que habría patrullaje */
  franjas: FranjaHoraria[];
  efecto: Efecto;
}

export interface Medidas {
  senalizacion: MedidaSenalizacion;
  patrullaje: MedidaPatrullaje;
}

/**
 * Punto de partida (SUPUESTOS, no datos del sistema). Se explican en pantalla con sus fuentes:
 *  - Señalización: un estudio de la FHWA sobre mejoras de bajo costo de señales y demarcación en intersecciones con PARE
 *    halló −8,3 % de siniestros totales (−10 % con heridos o muertos, −15 % nocturnos): central 8 %.
 *  - Patrullaje: los estudios publicados miden efectos locales y de corto plazo muy variables (de ≈ −9 % a ≈ −38 %);
 *    un patrullaje sostenido y repartido en una ruta completa debe rendir menos: central 10 %, hasta 25 %.
 * El mínimo es 0 % en ambos casos: que la medida no sirva es una posibilidad real.
 */
export const MEDIDAS_POR_DEFECTO: Medidas = {
  senalizacion: { activa: true, cobertura: 100, efecto: { minimo: 0, central: 8, maximo: 15 } },
  patrullaje: { activa: true, franjas: ['Madrugada', 'Noche'], efecto: { minimo: 0, central: 10, maximo: 25 } },
};

export function copiarMedidas(m: Medidas): Medidas {
  return {
    senalizacion: { ...m.senalizacion, efecto: { ...m.senalizacion.efecto } },
    patrullaje: { ...m.patrullaje, franjas: [...m.patrullaje.franjas], efecto: { ...m.patrullaje.efecto } },
  };
}

const acotar = (n: number, min: number, max: number): number => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

/** Deja el efecto ordenado (mínimo ≤ central ≤ máximo) y dentro de 0-100 */
export function normalizarEfecto(e: Efecto): Efecto {
  const central = acotar(e.central, 0, 100);
  return { minimo: Math.min(acotar(e.minimo, 0, 100), central), central, maximo: Math.max(acotar(e.maximo, 0, 100), central) };
}

/**
 * Cambia UN valor del rango y mueve los demás solo si hace falta para que siga siendo mínimo ≤ central ≤ máximo
 * (así lo que la persona acaba de escribir es lo que queda).
 */
export function fijarEfecto(e: Efecto, campo: keyof Efecto, valor: number): Efecto {
  const v = acotar(valor, 0, 100);
  const n = { ...e, [campo]: v };
  if (campo === 'minimo') {
    n.central = Math.max(n.central, v);
    n.maximo = Math.max(n.maximo, n.central);
  } else if (campo === 'central') {
    n.minimo = Math.min(n.minimo, v);
    n.maximo = Math.max(n.maximo, v);
  } else {
    n.central = Math.min(n.central, v);
    n.minimo = Math.min(n.minimo, n.central);
  }
  return n;
}

export function normalizarMedidas(m: Medidas): Medidas {
  return {
    senalizacion: { activa: m.senalizacion.activa, cobertura: acotar(m.senalizacion.cobertura, 0, 100), efecto: normalizarEfecto(m.senalizacion.efecto) },
    patrullaje: {
      activa: m.patrullaje.activa,
      franjas: FRANJAS.filter((f) => m.patrullaje.franjas.includes(f)),
      efecto: normalizarEfecto(m.patrullaje.efecto),
    },
  };
}

export const sonMedidasPorDefecto = (m: Medidas): boolean =>
  JSON.stringify(normalizarMedidas(m)) === JSON.stringify(normalizarMedidas(MEDIDAS_POR_DEFECTO));

// ---------------------------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------------------------

/** El efecto que se usa en cada cálculo: el mínimo, el central o el máximo del rango */
export type Hipotesis = 'minimo' | 'central' | 'maximo';
export const HIPOTESIS: readonly Hipotesis[] = ['minimo', 'central', 'maximo'];

const MS_POR_DIA = 86_400_000;
/** Menos que esto no se anualiza: con un período más corto las cifras por año no significan nada */
const MIN_ANIOS = 1 / 12;

/** Años que cubre el conjunto de datos (de la primera a la última fecha). Sirve para pasar totales a «por año» */
export function aniosDeDatos(registros: readonly Siniestro[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const s of registros) {
    const t = Date.parse(s.fecha);
    if (!Number.isFinite(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min)) return 1;
  return Math.max(MIN_ANIOS, ((max - min) / MS_POR_DIA + 1) / 365.25);
}

/** ¿La señalización mejorada actúa sobre este siniestro? Solo donde hoy NO hay señalización */
const alcanzaSenalizacion = (s: Siniestro): boolean => !s.senalizacion;

/**
 * Probabilidad (0-1) de que este siniestro se evite. Cada medida lo evita con su propia probabilidad y se combinan
 * como eventos independientes: P = 1 − Π(1 − pᵢ). Así dos medidas sobre el mismo siniestro no suman más del 100 %.
 */
export function probabilidadDeEvitar(s: Siniestro, medidas: Medidas, hipotesis: Hipotesis): number {
  let noSeEvita = 1;
  if (medidas.senalizacion.activa && alcanzaSenalizacion(s)) {
    noSeEvita *= 1 - (medidas.senalizacion.cobertura / 100) * (medidas.senalizacion.efecto[hipotesis] / 100);
  }
  if (medidas.patrullaje.activa && medidas.patrullaje.franjas.includes(s.franja)) {
    noSeEvita *= 1 - medidas.patrullaje.efecto[hipotesis] / 100;
  }
  return 1 - noSeEvita;
}

/** Totales (de todo el período de los datos) de lo que se evitaría en el alcance */
export interface Impacto {
  siniestrosEvitados: number;
  fallecidosEvitados: number;
  gravesEvitados: number;
  levesEvitados: number;
  /** % de los siniestros del alcance que se evitarían */
  reduccionPct: number;
  /** ISS de lo que quedaría (la severidad promedio por siniestro) */
  issDespues: number;
  /** TSV del alcance (% del total nacional) tras la medida; el total nacional también baja */
  tsvDespues: number;
}

function calcularImpacto(
  enElAlcance: readonly Siniestro[],
  totalNacional: number,
  medidas: Medidas,
  hipotesis: Hipotesis,
): Impacto {
  let evitados = 0, fallecidos = 0, graves = 0, leves = 0;
  let ponderadoRestante = 0, restantes = 0;
  const { w1Fallecidos, w2Graves, w3Leves } = PESOS_SEVERIDAD;
  for (const s of enElAlcance) {
    const p = probabilidadDeEvitar(s, medidas, hipotesis);
    evitados += p;
    fallecidos += p * s.fallecidos;
    graves += p * s.heridosGraves;
    leves += p * s.heridosLeves;
    restantes += 1 - p;
    ponderadoRestante += (1 - p) * (w1Fallecidos * s.fallecidos + w2Graves * s.heridosGraves + w3Leves * s.heridosLeves);
  }
  const n = enElAlcance.length;
  return {
    siniestrosEvitados: evitados,
    fallecidosEvitados: fallecidos,
    gravesEvitados: graves,
    levesEvitados: leves,
    reduccionPct: n > 0 ? (evitados / n) * 100 : 0,
    issDespues: restantes > 0 ? ponderadoRestante / restantes : 0,
    tsvDespues: calcularTSV(n - evitados, totalNacional - evitados),
  };
}

export interface Base {
  /** siniestros del alcance, por año */
  siniestrosAnio: number;
  fallecidosAnio: number;
  gravesAnio: number;
  levesAnio: number;
  iss: number;
  tsv: number;
}

export interface Cobertura {
  /** % de los siniestros del alcance donde hoy no hay señalización (los que la mejora podría alcanzar) */
  sinSenalizacionPct: number;
  /** % de los siniestros del alcance que ocurren en las franjas con patrullaje */
  enFranjasPct: number;
  /** % que alcanza al menos una de las medidas activas */
  alcanzadosPct: number;
  /** % de los siniestros del alcance que ocurren en cada franja (sirve para decidir dónde patrullar) */
  porFranjaPct: Record<FranjaHoraria, number>;
}

export interface ResultadoSimulacion {
  alcance: Alcance;
  /** siniestros que hay en el alcance (todo el período) */
  siniestros: number;
  totalNacional: number;
  anios: number;
  base: Base;
  cobertura: Cobertura;
  impacto: Record<Hipotesis, Impacto>;
  /** lo que aportaría cada medida sola (efecto central); null si la medida está desactivada */
  porMedida: { senalizacion: Impacto | null; patrullaje: Impacto | null };
  /** desviación típica natural del conteo anual (√N): cuánto varía un año de otro solo por azar */
  ruidoAnual: number;
}

/**
 * Proyecta el impacto de las medidas sobre los siniestros de un alcance.
 * @param todos todos los siniestros cargados (el total nacional es el denominador del TSV)
 * @returns null si en ese alcance no hay siniestros
 */
export function simular(todos: readonly Siniestro[], alcanceEntrada: Alcance, medidasEntrada: Medidas): ResultadoSimulacion | null {
  const alcance = { ...alcanceEntrada };
  const medidas = normalizarMedidas(medidasEntrada);
  const enElAlcance = todos.filter((s) => enAlcance(s, alcance));
  const n = enElAlcance.length;
  if (n === 0) return null;

  const anios = aniosDeDatos(todos);
  const total = (f: (s: Siniestro) => number) => enElAlcance.reduce((a, s) => a + f(s), 0);
  const sinSenal = enElAlcance.filter(alcanzaSenalizacion).length;
  const enFranjas = enElAlcance.filter((s) => medidas.patrullaje.franjas.includes(s.franja)).length;
  const alcanzados = enElAlcance.filter((s) => {
    const porSenal = medidas.senalizacion.activa && alcanzaSenalizacion(s);
    const porPatrulla = medidas.patrullaje.activa && medidas.patrullaje.franjas.includes(s.franja);
    return porSenal || porPatrulla;
  }).length;

  const solo = (cual: 'senalizacion' | 'patrullaje'): Impacto | null => {
    if (!medidas[cual].activa) return null;
    const otra = cual === 'senalizacion' ? 'patrullaje' : 'senalizacion';
    const soloEsta: Medidas = { ...medidas, [otra]: { ...medidas[otra], activa: false } };
    return calcularImpacto(enElAlcance, todos.length, soloEsta, 'central');
  };

  return {
    alcance,
    siniestros: n,
    totalNacional: todos.length,
    anios,
    base: {
      siniestrosAnio: n / anios,
      fallecidosAnio: total((s) => s.fallecidos) / anios,
      gravesAnio: total((s) => s.heridosGraves) / anios,
      levesAnio: total((s) => s.heridosLeves) / anios,
      iss: calcularISS(enElAlcance),
      tsv: calcularTSV(n, todos.length),
    },
    cobertura: {
      sinSenalizacionPct: (sinSenal / n) * 100,
      enFranjasPct: (enFranjas / n) * 100,
      alcanzadosPct: (alcanzados / n) * 100,
      porFranjaPct: Object.fromEntries(
        FRANJAS.map((f) => [f, (enElAlcance.filter((s) => s.franja === f).length / n) * 100]),
      ) as Record<FranjaHoraria, number>,
    },
    impacto: {
      minimo: calcularImpacto(enElAlcance, todos.length, medidas, 'minimo'),
      central: calcularImpacto(enElAlcance, todos.length, medidas, 'central'),
      maximo: calcularImpacto(enElAlcance, todos.length, medidas, 'maximo'),
    },
    porMedida: { senalizacion: solo('senalizacion'), patrullaje: solo('patrullaje') },
    ruidoAnual: Math.sqrt(n / anios),
  };
}

/** Pasa un total del período a «por año» */
export const porAnio = (total: number, anios: number): number => total / anios;

// ---------------------------------------------------------------------------------------------
// ¿Se notaría?
// ---------------------------------------------------------------------------------------------

export type Detectabilidad = 'no-se-notaria' | 'dudosa' | 'se-notaria';

/**
 * Los siniestros de un año a otro varían por azar (≈ √N). Si lo que se espera evitar es menor que esa variación,
 * mirar un solo año no permite saber si la medida funcionó. Regla: menos de 1 desviación → no se notaría;
 * entre 1 y 2 → dudosa; 2 o más → se notaría.
 */
export function detectabilidad(evitadosAnio: number, ruidoAnual: number): { nivel: Detectabilidad; veces: number } {
  const veces = ruidoAnual > 0 ? evitadosAnio / ruidoAnual : 0;
  return { nivel: veces < 1 ? 'no-se-notaria' : veces < 2 ? 'dudosa' : 'se-notaria', veces };
}

// ---------------------------------------------------------------------------------------------
// Para descargar
// ---------------------------------------------------------------------------------------------

export function simulacionATabla(r: ResultadoSimulacion, medidas: Medidas): { columnas: string[]; filas: (string | number)[][] } {
  const m = normalizarMedidas(medidas);
  const redondear = (n: number, d = 2) => Number(n.toFixed(d));
  const filas: (string | number)[][] = HIPOTESIS.map((h) => {
    const i = r.impacto[h];
    return [
      h === 'minimo' ? 'Efecto mínimo' : h === 'central' ? 'Efecto central' : 'Efecto máximo',
      redondear(porAnio(i.siniestrosEvitados, r.anios)),
      redondear(porAnio(i.fallecidosEvitados, r.anios)),
      redondear(porAnio(i.gravesEvitados, r.anios)),
      redondear(i.reduccionPct),
      redondear(i.issDespues),
      redondear(i.tsvDespues),
    ];
  });
  return {
    columnas: [
      `Hipótesis (alcance: ${describirAlcance(r.alcance)}; señalización ${m.senalizacion.activa ? `${m.senalizacion.efecto.minimo}/${m.senalizacion.efecto.central}/${m.senalizacion.efecto.maximo} %` : 'no'}; ` +
        `patrullaje ${m.patrullaje.activa ? `${m.patrullaje.efecto.minimo}/${m.patrullaje.efecto.central}/${m.patrullaje.efecto.maximo} % en ${m.patrullaje.franjas.join('+') || 'ninguna franja'}` : 'no'})`,
      'Siniestros evitados por año', 'Fallecidos evitados por año', 'Heridos graves evitados por año', 'Reducción de siniestros (%)',
      'ISS después', 'TSV después (%)',
    ],
    filas,
  };
}
