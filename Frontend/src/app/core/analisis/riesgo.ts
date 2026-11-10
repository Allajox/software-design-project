import {
  CALZADAS, CLIMAS, Clima, EstadoCalzada, FRANJAS, FranjaHoraria,
} from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';
import { fmtDec1, fmtPct } from '../../shared/utils/formato';

/**
 * Motor de predicción de riesgo (RF-7): estima, para un escenario (clima + estado de la calzada +
 * franja horaria), qué tan frecuentes son los siniestros y qué tan graves resultan.
 *
 * Todo es puro (datos + parámetros → números), sin Angular, para probarlo y moverlo al backend.
 *
 * Dos modelos sencillos y explicables, ambos ajustados en el navegador con los siniestros cargados:
 *
 *  1. FRECUENCIA (¿qué tan probable es que ocurra un siniestro?). Regresión de Poisson con
 *     «exposición»: no basta contar siniestros, hay que saber cuánto tiempo hubo cada condición
 *     (llueve menos horas de las que hace buen tiempo). Sin esa exposición, «despejado» siempre
 *     parecería lo más peligroso solo por ser lo más común. El sistema aún no tiene series de
 *     lluvia ni de tránsito (vendrán del IMN y del COSEVI), así que la exposición es un SUPUESTO
 *     editable en pantalla. El resultado se expresa en «veces el promedio», no en probabilidad absoluta.
 *
 *  2. GRAVEDAD (si ocurre un siniestro, ¿qué tan probable es que sea grave o mortal?). Regresión
 *     logística sobre los propios siniestros: esta parte NO necesita supuestos, solo datos.
 *
 * El índice de riesgo combina ambos: frecuencia relativa × gravedad relativa (1 = el promedio).
 */

// ---------------------------------------------------------------------------------------------
// Escenario y exposición
// ---------------------------------------------------------------------------------------------

export interface Escenario {
  clima: Clima;
  calzada: EstadoCalzada;
  franja: FranjaHoraria;
}

export type Factor = 'clima' | 'calzada' | 'franja';

/** Cuánto del tiempo se da cada condición, en % (cada grupo suma 100) */
export interface Exposicion {
  clima: Record<Clima, number>;
  calzada: Record<EstadoCalzada, number>;
  franja: Record<FranjaHoraria, number>;
}

/**
 * Supuesto de trabajo (NO es un dato medido): porcentaje de las horas del año con cada condición.
 * Las franjas duran 6 horas cada una, por eso 25 % cada una. Reemplazar con datos del IMN cuando se conecte.
 */
export const EXPOSICION_POR_DEFECTO: Exposicion = {
  clima: { 'Buen tiempo': 87, 'Lluvia': 11, 'Neblina': 1, 'Lluvia con neblina': 1 },
  calzada: { 'Buena': 92, 'Huecos': 3, 'Resbaladiza': 2, 'Construcción o reparación': 1, 'Hundimientos': 1, 'Otros': 1 },
  franja: { 'Madrugada': 25, 'Mañana': 25, 'Tarde': 25, 'Noche': 25 },
};

/** Ninguna condición puede tener menos de esto (en fracción) o las tasas se disparan */
const EXPOSICION_MINIMA = 0.005;

export function copiarExposicion(e: Exposicion): Exposicion {
  return { clima: { ...e.clima }, calzada: { ...e.calzada }, franja: { ...e.franja } };
}

function normalizarGrupo<K extends string>(valores: Record<K, number>, respaldo: Record<K, number>): Record<K, number> {
  const claves = Object.keys(respaldo) as K[];
  const limpio = (r: Record<K, number>) => claves.map((k) => (Number.isFinite(r[k]) && r[k] > 0 ? r[k] : 0));
  let v = limpio(valores);
  if (v.reduce((a, b) => a + b, 0) <= 0) v = limpio(respaldo);
  const total = v.reduce((a, b) => a + b, 0);
  const fracciones = v.map((x) => Math.max(EXPOSICION_MINIMA, x / total));
  const suma = fracciones.reduce((a, b) => a + b, 0);
  return Object.fromEntries(claves.map((k, i) => [k, fracciones[i] / suma])) as Record<K, number>;
}

/** Convierte porcentajes cualesquiera en fracciones que suman 1 por grupo (valores inválidos → los de respaldo) */
export function normalizarExposicion(e: Exposicion): Exposicion {
  return {
    clima: normalizarGrupo(e.clima, EXPOSICION_POR_DEFECTO.clima),
    calzada: normalizarGrupo(e.calzada, EXPOSICION_POR_DEFECTO.calzada),
    franja: normalizarGrupo(e.franja, EXPOSICION_POR_DEFECTO.franja),
  };
}

export const esExposicionPorDefecto = (e: Exposicion): boolean =>
  JSON.stringify(normalizarExposicion(e)) === JSON.stringify(normalizarExposicion(EXPOSICION_POR_DEFECTO));

// ---------------------------------------------------------------------------------------------
// Álgebra mínima y regresión (logística y de Poisson) por Newton-Raphson
// ---------------------------------------------------------------------------------------------

/** Inversa por Gauss-Jordan con pivoteo parcial. Devuelve null si la matriz es singular. */
export function invertir(m: readonly (readonly number[])[]): number[][] | null {
  const n = m.length;
  const a = m.map((fila, i) => [...fila, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivote = col;
    for (let f = col + 1; f < n; f++) if (Math.abs(a[f][col]) > Math.abs(a[pivote][col])) pivote = f;
    if (Math.abs(a[pivote][col]) < 1e-12) return null;
    [a[col], a[pivote]] = [a[pivote], a[col]];
    const div = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= div;
    for (let f = 0; f < n; f++) {
      if (f === col) continue;
      const factor = a[f][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[f][j] -= factor * a[col][j];
    }
  }
  return a.map((fila) => fila.slice(n));
}

export type Familia = 'binomial' | 'poisson';

export interface FilaGLM {
  x: readonly number[];
  /** éxitos (binomial) o conteo (Poisson) */
  y: number;
  /** ensayos (solo binomial) */
  n?: number;
  /** log de la exposición (solo Poisson) */
  offset?: number;
}

export interface AjusteGLM {
  beta: number[];
  /** matriz de covarianza de los coeficientes */
  covarianza: number[][];
  iteraciones: number;
  convergio: boolean;
}

const sigmoide = (z: number): number => 1 / (1 + Math.exp(-z));

/**
 * Ajusta un modelo lineal generalizado con enlace logit (binomial) o log (Poisson).
 * La primera columna de `x` es la constante (no se penaliza); el resto lleva una penalización
 * ridge pequeña (`l2`) que evita coeficientes infinitos cuando una categoría casi no aparece.
 */
export function ajustarGLM(familia: Familia, filas: readonly FilaGLM[], l2 = 1): AjusteGLM {
  const p = filas[0]?.x.length ?? 0;
  const beta = new Array<number>(p).fill(0);
  if (familia === 'poisson' && p > 0) {
    // punto de partida sensato: la constante en el log de la tasa media
    const total = filas.reduce((s, f) => s + f.y, 0);
    const expo = filas.reduce((s, f) => s + Math.exp(f.offset ?? 0), 0);
    beta[0] = Math.log(Math.max(total, 0.5) / Math.max(expo, 1e-9));
  }
  let covarianza: number[][] = [];
  let convergio = false;
  let iteraciones = 0;

  for (; iteraciones < 60; iteraciones++) {
    const gradiente = new Array<number>(p).fill(0);
    const hessiana = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (const f of filas) {
      let eta = f.offset ?? 0;
      for (let j = 0; j < p; j++) eta += f.x[j] * beta[j];
      let media: number;
      let peso: number;
      if (familia === 'binomial') {
        const prob = sigmoide(eta);
        const n = f.n ?? 0;
        media = n * prob;
        peso = n * prob * (1 - prob);
      } else {
        media = Math.exp(Math.min(eta, 50));
        peso = media;
      }
      const residuo = f.y - media;
      for (let j = 0; j < p; j++) {
        if (f.x[j] === 0) continue;
        gradiente[j] += residuo * f.x[j];
        for (let k = 0; k < p; k++) hessiana[j][k] += peso * f.x[j] * f.x[k];
      }
    }
    for (let j = 1; j < p; j++) {
      gradiente[j] -= l2 * beta[j];
      hessiana[j][j] += l2;
    }
    hessiana[0][0] += 1e-9;
    const inversa = invertir(hessiana);
    if (!inversa) break;
    covarianza = inversa;
    let maxPaso = 0;
    for (let j = 0; j < p; j++) {
      let paso = 0;
      for (let k = 0; k < p; k++) paso += inversa[j][k] * gradiente[k];
      beta[j] += paso;
      maxPaso = Math.max(maxPaso, Math.abs(paso));
    }
    if (maxPaso < 1e-9) {
      convergio = true;
      iteraciones++;
      break;
    }
  }
  return { beta, covarianza, iteraciones, convergio };
}

/** Área bajo la curva ROC: probabilidad de que un caso «positivo» reciba mayor puntaje que uno «negativo» (empates cuentan 1/2) */
export function auc(puntajes: readonly number[], etiquetas: readonly boolean[]): number {
  const idx = puntajes.map((_, i) => i).sort((a, b) => puntajes[a] - puntajes[b]);
  let sumaRangosPositivos = 0;
  let positivos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && puntajes[idx[j + 1]] === puntajes[idx[i]]) j++;
    const rangoMedio = (i + j) / 2 + 1; // rangos 1..n, empates promediados
    for (let k = i; k <= j; k++) {
      if (etiquetas[idx[k]]) {
        sumaRangosPositivos += rangoMedio;
        positivos++;
      }
    }
    i = j + 1;
  }
  const negativos = idx.length - positivos;
  if (positivos === 0 || negativos === 0) return 0.5;
  return (sumaRangosPositivos - (positivos * (positivos + 1)) / 2) / (positivos * negativos);
}

// ---------------------------------------------------------------------------------------------
// Entrenamiento
// ---------------------------------------------------------------------------------------------

const REF = { clima: 'Despejado' as Clima, calzada: 'Seca' as EstadoCalzada, franja: 'Mañana' as FranjaHoraria };
const CLIMAS_X = CLIMAS.filter((c) => c !== REF.clima);
const CALZADAS_X = CALZADAS.filter((c) => c !== REF.calzada);
const FRANJAS_X = FRANJAS.filter((f) => f !== REF.franja);

/** Fila del diseño: [constante, clima (sin la referencia), calzada, franja] */
export function vectorEscenario(e: Escenario): number[] {
  return [
    1,
    ...CLIMAS_X.map((c) => (e.clima === c ? 1 : 0)),
    ...CALZADAS_X.map((c) => (e.calzada === c ? 1 : 0)),
    ...FRANJAS_X.map((f) => (e.franja === f ? 1 : 0)),
  ];
}

export const todasLasCombinaciones = (): Escenario[] =>
  CLIMAS.flatMap((clima) => CALZADAS.flatMap((calzada) => FRANJAS.map((franja) => ({ clima, calzada, franja }))));

const claveCelda = (e: Escenario): string => `${e.clima}|${e.calzada}|${e.franja}`;

interface Celda {
  escenario: Escenario;
  n: number;
  graves: number;
  mortales: number;
}

function contarCeldas(registros: readonly Siniestro[]): Map<string, Celda> {
  const celdas = new Map<string, Celda>();
  for (const e of todasLasCombinaciones()) celdas.set(claveCelda(e), { escenario: e, n: 0, graves: 0, mortales: 0 });
  for (const s of registros) {
    const c = celdas.get(claveCelda({ clima: s.clima, calzada: s.calzada, franja: s.franja }));
    if (!c) continue;
    c.n++;
    if ( s.severidad !== 'Solo heridos leves') c.graves++;
    if (s.severidad === 'Fallecido') c.mortales++;
  }
  return celdas;
}

export interface CalidadModelo {
  /** AUC de «grave o mortal» en siniestros que el modelo no vio al ajustarse (0,5 = azar, 1 = perfecto) */
  auc: number;
  aucMortal: number;
  /** cuántos siniestros se usaron para evaluar */
  evaluadoCon: number;
}

export interface ModeloRiesgo {
  entrenadoCon: number;
  exposicion: Exposicion;
  /** coeficientes y covarianza de cada modelo */
  frecuencia: AjusteGLM;
  grave: AjusteGLM;
  mortal: AjusteGLM;
  /** tasa media (por unidad de exposición) en el promedio de las condiciones: el «1» de la frecuencia relativa */
  tasaPromedio: number;
  base: { pGrave: number; pMortal: number };
  celdas: Map<string, Celda>;
  /** null si hay muy pocos siniestros para separar una parte y evaluar */
  calidad: CalidadModelo | null;
  convergio: boolean;
}

export const MIN_SINIESTROS_MODELO = 50;
const MIN_PARA_EVALUAR = 400;

function ajustarSobre(registros: readonly Siniestro[], exposicion: Exposicion) {
  const celdas = contarCeldas(registros);
  const filasGrave: FilaGLM[] = [];
  const filasMortal: FilaGLM[] = [];
  const filasFrecuencia: FilaGLM[] = [];
  for (const c of celdas.values()) {
    const x = vectorEscenario(c.escenario);
    const expo = exposicion.clima[c.escenario.clima] * exposicion.calzada[c.escenario.calzada] * exposicion.franja[c.escenario.franja];
    filasFrecuencia.push({ x, y: c.n, offset: Math.log(expo) });
    if (c.n > 0) {
      filasGrave.push({ x, y: c.graves, n: c.n });
      filasMortal.push({ x, y: c.mortales, n: c.n });
    }
  }
  return {
    celdas,
    frecuencia: ajustarGLM('poisson', filasFrecuencia),
    grave: ajustarGLM('binomial', filasGrave),
    mortal: ajustarGLM('binomial', filasMortal),
  };
}

const lineal = (beta: readonly number[], x: readonly number[]): number => beta.reduce((s, b, i) => s + b * x[i], 0);
const varianzaLineal = (cov: readonly (readonly number[])[], x: readonly number[]): number => {
  let v = 0;
  for (let i = 0; i < x.length; i++) for (let j = 0; j < x.length; j++) v += x[i] * cov[i][j] * x[j];
  return Math.max(0, v);
};

/**
 * Ajusta los modelos con todos los siniestros. Si hay suficientes, además separa el 20 % (los de
 * ID múltiplo de 5, así es reproducible) para medir honestamente qué tan bien separa lo grave de lo leve.
 * @returns null si no hay siniestros
 */
export function entrenarModelo(registros: readonly Siniestro[], exposicionEntrada: Exposicion = EXPOSICION_POR_DEFECTO): ModeloRiesgo | null {
  if (registros.length === 0) return null;
  const exposicion = normalizarExposicion(exposicionEntrada);
  const completo = ajustarSobre(registros, exposicion);

  const total = registros.length;
  const base = {
    pGrave: registros.filter((s) => s.severidad !== 'Solo heridos leves').length / total,
    pMortal: registros.filter((s) => s.severidad === 'Fallecido').length / total,
  };

  // tasa promedio: lo que se espera por unidad de exposición, promediando sobre todas las condiciones
  let tasaPromedio = 0;
  for (const e of todasLasCombinaciones()) {
    const expo = exposicion.clima[e.clima] * exposicion.calzada[e.calzada] * exposicion.franja[e.franja];
    tasaPromedio += expo * Math.exp(lineal(completo.frecuencia.beta, vectorEscenario(e)));
  }

  let calidad: CalidadModelo | null = null;
  if (total >= MIN_PARA_EVALUAR) {
    const entrenamiento = registros.filter((s) => s.id % 5 !== 0);
    const prueba = registros.filter((s) => s.id % 5 === 0);
    const parcial = ajustarSobre(entrenamiento, exposicion);
    const probaDe = (ajuste: AjusteGLM, s: Siniestro) =>
      sigmoide(lineal(ajuste.beta, vectorEscenario({ clima: s.clima, calzada: s.calzada, franja: s.franja })));
    calidad = {
      auc: auc(prueba.map((s) => probaDe(parcial.grave, s)), prueba.map((s) => s.severidad !== 'Solo heridos leves')),
      aucMortal: auc(prueba.map((s) => probaDe(parcial.mortal, s)), prueba.map((s) => s.severidad === 'Fallecido')),
      evaluadoCon: prueba.length,
    };
  }

  return {
    entrenadoCon: total,
    exposicion,
    frecuencia: completo.frecuencia,
    grave: completo.grave,
    mortal: completo.mortal,
    tasaPromedio,
    base,
    celdas: completo.celdas,
    calidad,
    convergio: completo.frecuencia.convergio && completo.grave.convergio && completo.mortal.convergio,
  };
}

// ---------------------------------------------------------------------------------------------
// Estimación
// ---------------------------------------------------------------------------------------------

export type NivelRiesgoVial = 'bajo' | 'moderado' | 'alto' | 'muy-alto';

/** El índice es «veces el promedio»; estos cortes son una convención de trabajo (ajustable aquí) */
export const UMBRALES_INDICE = { moderado: 0.75, alto: 1.5, muyAlto: 2.5 } as const;

export const TEXTO_NIVEL_VIAL: Record<NivelRiesgoVial, string> = {
  'bajo': 'Bajo',
  'moderado': 'Moderado',
  'alto': 'Alto',
  'muy-alto': 'Muy alto',
};

export function nivelDelIndice(indice: number): NivelRiesgoVial {
  if (indice < UMBRALES_INDICE.moderado) return 'bajo';
  if (indice < UMBRALES_INDICE.alto) return 'moderado';
  if (indice < UMBRALES_INDICE.muyAlto) return 'alto';
  return 'muy-alto';
}

export type Intervalo = readonly [number, number];

export interface Estimacion {
  escenario: Escenario;
  /** veces el promedio de siniestros por hora de exposición (1 = promedio) */
  frecuencia: number;
  frecuenciaIC: Intervalo;
  /** probabilidad (0-1) de que un siniestro en estas condiciones sea grave o mortal */
  pGrave: number;
  pGraveIC: Intervalo;
  pMortal: number;
  pMortalIC: Intervalo;
  /** frecuencia × (pGrave ÷ pGrave promedio) */
  indice: number;
  nivel: NivelRiesgoVial;
  /** siniestros observados con exactamente esta combinación */
  soporte: number;
}

const Z95 = 1.96;

export function estimar(modelo: ModeloRiesgo, escenario: Escenario): Estimacion {
  const x = vectorEscenario(escenario);

  const etaF = lineal(modelo.frecuencia.beta, x);
  const seF = Math.sqrt(varianzaLineal(modelo.frecuencia.covarianza, x));
  const rel = (eta: number) => Math.exp(eta) / modelo.tasaPromedio;
  const frecuencia = rel(etaF);

  const prob = (ajuste: AjusteGLM): { p: number; ic: Intervalo } => {
    const eta = lineal(ajuste.beta, x);
    const se = Math.sqrt(varianzaLineal(ajuste.covarianza, x));
    return { p: sigmoide(eta), ic: [sigmoide(eta - Z95 * se), sigmoide(eta + Z95 * se)] };
  };
  const g = prob(modelo.grave);
  const m = prob(modelo.mortal);
  const indice = modelo.base.pGrave > 0 ? frecuencia * (g.p / modelo.base.pGrave) : frecuencia;

  return {
    escenario,
    frecuencia,
    frecuenciaIC: [rel(etaF - Z95 * seF), rel(etaF + Z95 * seF)],
    pGrave: g.p,
    pGraveIC: g.ic,
    pMortal: m.p,
    pMortalIC: m.ic,
    indice,
    nivel: nivelDelIndice(indice),
    soporte: modelo.celdas.get(claveCelda(escenario))?.n ?? 0,
  };
}

const NIVELES_DE: Record<Factor, readonly string[]> = { clima: CLIMAS, calzada: CALZADAS, franja: FRANJAS };

/** Cómo cambia la estimación si solo cambia UN factor y los otros quedan como están (la «curva» de ese factor) */
export function curvaPorFactor(modelo: ModeloRiesgo, escenario: Escenario, factor: Factor): Estimacion[] {
  return NIVELES_DE[factor].map((nivel) => estimar(modelo, { ...escenario, [factor]: nivel } as Escenario));
}

/** Las 60 combinaciones posibles, para el diagrama de dispersión */
export function estimarTodas(modelo: ModeloRiesgo): Estimacion[] {
  return todasLasCombinaciones().map((e) => estimar(modelo, e));
}

// ---------------------------------------------------------------------------------------------
// Utilidades para mostrar
// ---------------------------------------------------------------------------------------------

/** Franja en la que cae una hora del reloj (0-23): Madrugada 0-5, Mañana 6-11, Tarde 12-17, Noche 18-23 */
export function franjaDeFecha(fecha: Date): FranjaHoraria {
  const h = fecha.getHours();
  return h < 6 ? 'Madrugada' : h < 12 ? 'Mañana' : h < 18 ? 'Tarde' : 'Noche';
}

export interface InterpretacionAuc {
  texto: string;
  /** ¿se puede decir que el modelo distingue algo? */
  util: boolean;
  /** Distingue poco: sirve para orientar, no para decidir */
  orientativa: boolean;
}

export function interpretarAuc(valor: number): InterpretacionAuc {
  if (valor < 0.55) return { texto: 'casi no distingue entre siniestros graves y leves', util: false, orientativa: true };
  if (valor < 0.65) return { texto: 'distingue de forma débil', util: true, orientativa: true };
  if (valor < 0.75) return { texto: 'distingue de forma moderada', util: true, orientativa: false };
  return { texto: 'distingue bien', util: true, orientativa: false };
}

/** Combina el escenario en una frase corta: «Lluvia · calzada húmeda · Noche» */
export function describirEscenario(e: Escenario): string {
  return `${e.clima} · calzada ${e.calzada.toLowerCase()} · ${e.franja}`;
}

// ---------------------------------------------------------------------------------------------
// Lectura honesta de una estimación
// ---------------------------------------------------------------------------------------------

export type Comparacion = 'mayor' | 'similar' | 'menor';

/**
 * Compara un valor con la referencia (el promedio) usando su intervalo de confianza:
 * solo dice «mayor» o «menor» si TODO el intervalo queda de un lado; si el promedio cae dentro
 * del intervalo la diferencia no es concluyente y se dice «similar». Evita contar como hallazgo lo que puede ser azar.
 */
export function compararConReferencia(ic: Intervalo, referencia: number): Comparacion {
  if (ic[0] > referencia) return 'mayor';
  if (ic[1] < referencia) return 'menor';
  return 'similar';
}

export interface Lectura {
  frecuencia: Comparacion;
  gravedad: Comparacion;
  mortalidad: Comparacion;
}

export function leerEstimacion(modelo: ModeloRiesgo, e: Estimacion): Lectura {
  return {
    frecuencia: compararConReferencia(e.frecuenciaIC, 1),
    gravedad: compararConReferencia(e.pGraveIC, modelo.base.pGrave),
    mortalidad: compararConReferencia(e.pMortalIC, modelo.base.pMortal),
  };
}

/** Por debajo de esto una combinación tiene pocos casos reales y su estimación se apoya sobre todo en el modelo */
export const SOPORTE_MINIMO = 30;

/** Las 60 combinaciones como tabla (para descargar o ver en pantalla) */
export function estimacionesATabla(estimaciones: readonly Estimacion[]): { columnas: string[]; filas: (string | number)[][] } {
  const r = (n: number, d = 2) => Number(n.toFixed(d));
  const pct = (p: number) => r(p * 100, 1);
  return {
    columnas: [
      'Clima', 'Calzada', 'Franja', 'Nivel', 'Índice (× promedio)', 'Frecuencia (× promedio)', 'Frecuencia IC95 inferior',
      'Frecuencia IC95 superior', '% grave o mortal', '% grave IC95 inferior', '% grave IC95 superior', '% mortal',
      '% mortal IC95 inferior', '% mortal IC95 superior', 'Siniestros observados',
    ],
    filas: estimaciones.map((e) => [
      e.escenario.clima, e.escenario.calzada, e.escenario.franja, TEXTO_NIVEL_VIAL[e.nivel], r(e.indice), r(e.frecuencia),
      r(e.frecuenciaIC[0]), r(e.frecuenciaIC[1]), pct(e.pGrave), pct(e.pGraveIC[0]), pct(e.pGraveIC[1]), pct(e.pMortal),
      pct(e.pMortalIC[0]), pct(e.pMortalIC[1]), e.soporte,
    ]),
  };
}

/**
 * Explica una estimación en una frase. Usa «mayor» o «menor» solo cuando el intervalo de confianza lo respalda
 * (ver `compararConReferencia`); si no, dice que no se distingue del promedio en lugar de inventar una diferencia.
 */
export function redactarEstimacion(modelo: ModeloRiesgo, e: Estimacion): string {
  const l = leerEstimacion(modelo, e);
  const donde = `En ${describirEscenario(e.escenario)}`;
  if (l.frecuencia === 'similar' && l.gravedad === 'similar') {
    return `${donde}, ni la frecuencia ni la gravedad de los siniestros se distinguen del promedio.`;
  }

  const frecuencia =
    l.frecuencia === 'mayor'
      ? `los siniestros ocurren con ${fmtDec1(e.frecuencia)} veces la frecuencia promedio`
      : l.frecuencia === 'menor'
        ? `los siniestros son menos frecuentes que el promedio (cerca del ${Math.round(e.frecuencia * 100)} % de lo normal)`
        : 'la frecuencia de siniestros no se distingue del promedio';

  const comparado = `${fmtPct(e.pGrave * 100)} frente a ${fmtPct(modelo.base.pGrave * 100)} en promedio`;
  const gravedad =
    l.gravedad === 'mayor'
      ? `es más probable que sean graves o mortales (${comparado})`
      : l.gravedad === 'menor'
        ? `es menos probable que sean graves o mortales (${comparado})`
        : 'su gravedad no se distingue del promedio';

  const contradictorio =
    (l.frecuencia === 'mayor' && l.gravedad === 'menor') || (l.frecuencia === 'menor' && l.gravedad === 'mayor');
  return `${donde}, ${frecuencia}${contradictorio ? ', pero ' : ' y '}${gravedad}.`;
}
