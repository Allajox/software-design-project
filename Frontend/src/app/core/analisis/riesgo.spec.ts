import { generarSiniestros } from '../data/generador-siniestros';
import { CALZADAS, CLIMAS, Clima, FRANJAS, FranjaHoraria } from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';
import {
  EXPOSICION_POR_DEFECTO, Escenario, ajustarGLM, auc, copiarExposicion, curvaPorFactor, entrenarModelo,
  esExposicionPorDefecto, estimar, estimarTodas, franjaDeFecha, interpretarAuc, invertir, nivelDelIndice,
  normalizarExposicion, todasLasCombinaciones, vectorEscenario,
  Intervalo, compararConReferencia, estimacionesATabla, leerEstimacion, redactarEstimacion,
} from './riesgo';

/** Generador pseudoaleatorio con semilla, para que las pruebas siempre den lo mismo */
function crearRng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let contador = 0;
const sin = (extra: Partial<Siniestro> = {}): Siniestro => ({
  id: ++contador,
  fecha: '2025-03-14',
  anio: 2025,
  mes: 3,
  diaSemana: 'Viernes',
  franja: 'Mañana',
  provincia: 'San José',
  canton: 'Escazú',
  distrito: 'San Rafael',
  ruta: 'Ruta 27',
  kilometro: 10,
  vehiculo: 'Particular',
  severidad: 'Leve',
  fallecidos: 0,
  heridosGraves: 0,
  heridosLeves: 1,
  clima: 'Despejado',
  calzada: 'Seca',
  senalizacion: true,
  edad: '26-40',
  genero: 'Masculino',
  condicion: 'Conductor',
  tiempoRespuestaMin: 15,
  ...extra,
});

const BASE: Escenario = { clima: 'Despejado', calzada: 'Seca', franja: 'Mañana' };

describe('Álgebra y regresión', () => {
  it('invertir devuelve la inversa y detecta matrices singulares', () => {
    const inv = invertir([[2, 0], [0, 4]]) as number[][];
    expect(inv[0][0]).toBeCloseTo(0.5, 12);
    expect(inv[1][1]).toBeCloseTo(0.25, 12);
    const m = [[4, 3, 1], [3, 5, 2], [1, 2, 6]];
    const i3 = invertir(m) as number[][];
    const producto = m.map((fila) => [0, 1, 2].map((j) => fila.reduce((s, v, k) => s + v * i3[k][j], 0)));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) expect(producto[a][b]).toBeCloseTo(a === b ? 1 : 0, 10);
    expect(invertir([[1, 2], [2, 4]])).toBeNull();
  });

  it('regresión logística recupera los coeficientes verdaderos', () => {
    // logit p = -1 + 0,8·x con x ∈ {0,1,2}
    const filas = [0, 1, 2].map((x) => {
      const n = 100_000;
      const p = 1 / (1 + Math.exp(-(-1 + 0.8 * x)));
      return { x: [1, x], y: Math.round(n * p), n };
    });
    const r = ajustarGLM('binomial', filas, 0);
    expect(r.convergio).toBe(true);
    expect(r.beta[0]).toBeCloseTo(-1, 2);
    expect(r.beta[1]).toBeCloseTo(0.8, 2);
    expect(r.covarianza[1][1]).toBeGreaterThan(0);
  });

  it('regresión de Poisson con exposición recupera la tasa', () => {
    // tasa = exp(0,5 + 0,7·x) por unidad de exposición; exposiciones distintas
    const filas = [
      { x: 0, expo: 1000 },
      { x: 1, expo: 500 },
      { x: 0, expo: 300 },
      { x: 1, expo: 2000 },
    ].map(({ x, expo }) => ({ x: [1, x], y: Math.round(expo * Math.exp(0.5 + 0.7 * x)), offset: Math.log(expo) }));
    const r = ajustarGLM('poisson', filas, 0);
    expect(r.convergio).toBe(true);
    expect(r.beta[0]).toBeCloseTo(0.5, 2);
    expect(r.beta[1]).toBeCloseTo(0.7, 2);
  });

  it('una categoría sin casos no rompe el ajuste (la penalización lo mantiene estable)', () => {
    const filas = [
      { x: [1, 0], y: 10, n: 100 },
      { x: [1, 1], y: 0, n: 0 },
    ];
    const r = ajustarGLM('binomial', filas.filter((f) => f.n > 0), 1);
    expect(r.beta.every(Number.isFinite)).toBe(true);
  });
});

describe('auc', () => {
  it('separación perfecta = 1, invertida = 0, todos empatados = 0,5', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [false, false, true, true])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [false, false, true, true])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [false, true, false, true])).toBe(0.5);
  });
  it('sin positivos o sin negativos no se puede evaluar: 0,5', () => {
    expect(auc([0.1, 0.9], [true, true])).toBe(0.5);
  });
  it('coincide con un cálculo a mano', () => {
    // positivos: 0.8, 0.4 · negativos: 0.6, 0.2 → pares ganados: (0.8>0.6) (0.8>0.2) (0.4>0.2) = 3 de 4
    expect(auc([0.8, 0.6, 0.4, 0.2], [true, false, true, false])).toBeCloseTo(0.75, 12);
  });
});

describe('Exposición', () => {
  it('normaliza a fracciones que suman 1 por grupo', () => {
    const n = normalizarExposicion(EXPOSICION_POR_DEFECTO);
    for (const grupo of [n.clima, n.calzada, n.franja]) {
      expect(Object.values(grupo).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });
  it('valores inválidos o un grupo en cero vuelven al respaldo', () => {
    const roto = copiarExposicion(EXPOSICION_POR_DEFECTO);
    roto.clima = { 'Despejado': 0, 'Nublado': 0, 'Lluvia': 0, 'Lluvia fuerte': 0, 'Neblina': Number.NaN };
    const n = normalizarExposicion(roto);
    expect(n.clima['Despejado']).toBeCloseTo(0.38, 12);
  });
  it('ninguna condición baja del mínimo aunque se ponga 0', () => {
    const e = copiarExposicion(EXPOSICION_POR_DEFECTO);
    e.clima['Neblina'] = 0;
    expect(normalizarExposicion(e).clima['Neblina']).toBeGreaterThan(0);
  });
  it('detecta si coincide con la de fábrica', () => {
    expect(esExposicionPorDefecto(EXPOSICION_POR_DEFECTO)).toBe(true);
    const e = copiarExposicion(EXPOSICION_POR_DEFECTO);
    e.clima['Lluvia'] = 30;
    expect(esExposicionPorDefecto(e)).toBe(false);
  });
});

describe('Escenarios', () => {
  it('hay 60 combinaciones distintas', () => {
    const todas = todasLasCombinaciones();
    expect(todas.length).toBe(CLIMAS.length * CALZADAS.length * FRANJAS.length);
    expect(new Set(todas.map((e) => `${e.clima}${e.calzada}${e.franja}`)).size).toBe(60);
  });
  it('el vector de diseño tiene la constante y una sola categoría activa por factor', () => {
    expect(vectorEscenario(BASE)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const v = vectorEscenario({ clima: 'Lluvia', calzada: 'Húmeda', franja: 'Noche' });
    expect(v[0]).toBe(1);
    expect(v.reduce((a, b) => a + b, 0)).toBe(4);
  });
  it('franjaDeFecha usa los límites 6/12/18', () => {
    const h = (hora: number) => franjaDeFecha(new Date(2026, 10, 8, hora, 30));
    expect([0, 5, 6, 11, 12, 17, 18, 23].map(h)).toEqual(
      ['Madrugada', 'Madrugada', 'Mañana', 'Mañana', 'Tarde', 'Tarde', 'Noche', 'Noche'] as FranjaHoraria[],
    );
  });
  it('niveles del índice', () => {
    expect(nivelDelIndice(0.5)).toBe('bajo');
    expect(nivelDelIndice(0.75)).toBe('moderado');
    expect(nivelDelIndice(1.49)).toBe('moderado');
    expect(nivelDelIndice(1.5)).toBe('alto');
    expect(nivelDelIndice(2.5)).toBe('muy-alto');
  });
  it('interpreta el AUC', () => {
    expect(interpretarAuc(0.52).util).toBe(false);
    expect(interpretarAuc(0.6).util).toBe(true);
    expect(interpretarAuc(0.8).texto).toBe('distingue bien');
    // débil (< 0,65) sirve para orientar, no para decidir
    expect(interpretarAuc(0.57).orientativa).toBe(true);
    expect(interpretarAuc(0.7).orientativa).toBe(false);
  });
});

/** Datos con efectos conocidos: la lluvia fuerte y la madrugada elevan la gravedad; la noche y la lluvia, la frecuencia */
function datosConEfectos(cantidad = 6000): Siniestro[] {
  const rng = crearRng(99);
  const pick = <T,>(pesos: readonly (readonly [T, number])[]): T => {
    const total = pesos.reduce((s, [, p]) => s + p, 0);
    let r = rng() * total;
    for (const [v, p] of pesos) {
      r -= p;
      if (r <= 0) return v;
    }
    return pesos[pesos.length - 1][0];
  };
  return Array.from({ length: cantidad }, () => {
    // frecuencia: Noche y Lluvia fuerte aparecen más de lo que su exposición supone
    const franja = pick([['Madrugada', 14], ['Mañana', 20], ['Tarde', 26], ['Noche', 40]] as const);
    const clima = pick([['Despejado', 30], ['Nublado', 25], ['Lluvia', 25], ['Lluvia fuerte', 14], ['Neblina', 6]] as const);
    const calzada = clima === 'Despejado' || clima === 'Nublado' ? 'Seca' : 'Húmeda';
    const pGrave = 0.2 + (franja === 'Madrugada' ? 0.25 : 0) + (clima === 'Lluvia fuerte' ? 0.2 : 0);
    const u = rng();
    const severidad = u < pGrave * 0.25 ? 'Fallecido' : u < pGrave ? 'Grave' : 'Leve';
    return sin({ franja, clima: clima as Clima, calzada, severidad, fallecidos: severidad === 'Fallecido' ? 1 : 0 });
  });
}

describe('entrenarModelo / estimar', () => {
  const datos = datosConEfectos();
  const modelo = entrenarModelo(datos)!;

  it('sin siniestros no hay modelo', () => {
    expect(entrenarModelo([])).toBeNull();
  });

  it('converge y guarda la cantidad de siniestros usados', () => {
    expect(modelo.convergio).toBe(true);
    expect(modelo.entrenadoCon).toBe(datos.length);
  });

  it('las probabilidades quedan entre 0 y 1 y los intervalos contienen la estimación', () => {
    for (const e of estimarTodas(modelo)) {
      for (const [p, ic] of [[e.pGrave, e.pGraveIC], [e.pMortal, e.pMortalIC]] as const) {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
        expect(ic[0]).toBeLessThanOrEqual(p);
        expect(ic[1]).toBeGreaterThanOrEqual(p);
      }
      expect(e.frecuenciaIC[0]).toBeLessThanOrEqual(e.frecuencia);
      expect(e.frecuenciaIC[1]).toBeGreaterThanOrEqual(e.frecuencia);
    }
  });

  it('la gravedad sube donde los datos tienen más gravedad', () => {
    const madrugada = estimar(modelo, { ...BASE, franja: 'Madrugada' });
    const manana = estimar(modelo, BASE);
    expect(madrugada.pGrave).toBeGreaterThan(manana.pGrave + 0.1);
    const fuerte = estimar(modelo, { ...BASE, clima: 'Lluvia fuerte', calzada: 'Húmeda' });
    const despejado = estimar(modelo, BASE);
    expect(fuerte.pGrave).toBeGreaterThan(despejado.pGrave + 0.1);
  });

  it('la frecuencia relativa descuenta la exposición: la noche pesa más que la mañana', () => {
    // la noche tiene 40 % de los siniestros pero solo 25 % del tiempo → ≈ 1,6; la mañana, 20 % → ≈ 0,8
    const noche = estimar(modelo, { ...BASE, franja: 'Noche' }).frecuencia;
    const manana = estimar(modelo, BASE).frecuencia;
    expect(noche / manana).toBeGreaterThan(1.8);
    expect(noche / manana).toBeLessThan(2.2);
  });

  it('con una exposición distinta cambian las frecuencias, no las gravedades', () => {
    const e2 = copiarExposicion(EXPOSICION_POR_DEFECTO);
    e2.clima['Lluvia fuerte'] = 25; // «llueve fuerte» 5 veces más tiempo de lo supuesto
    const otro = entrenarModelo(datos, e2)!;
    const esc: Escenario = { clima: 'Lluvia fuerte', calzada: 'Húmeda', franja: 'Tarde' };
    expect(estimar(otro, esc).frecuencia).toBeLessThan(estimar(modelo, esc).frecuencia);
    expect(estimar(otro, esc).pGrave).toBeCloseTo(estimar(modelo, esc).pGrave, 10);
  });

  it('el índice es frecuencia × gravedad relativa', () => {
    const e = estimar(modelo, { ...BASE, franja: 'Noche' });
    expect(e.indice).toBeCloseTo(e.frecuencia * (e.pGrave / modelo.base.pGrave), 10);
    expect(e.nivel).toBe(nivelDelIndice(e.indice));
  });

  it('el promedio de la frecuencia relativa, ponderado por la exposición, es 1', () => {
    const expo = modelo.exposicion;
    const promedio = estimarTodas(modelo).reduce(
      (s, e) => s + e.frecuencia * expo.clima[e.escenario.clima] * expo.calzada[e.escenario.calzada] * expo.franja[e.escenario.franja],
      0,
    );
    expect(promedio).toBeCloseTo(1, 8);
  });

  it('reporta el soporte (siniestros observados) de cada combinación', () => {
    const e = estimar(modelo, { ...BASE, franja: 'Noche' });
    const reales = datos.filter((s) => s.clima === 'Despejado' && s.calzada === 'Seca' && s.franja === 'Noche').length;
    expect(e.soporte).toBe(reales);
    expect(estimar(modelo, { clima: 'Despejado', calzada: 'Derrumbe', franja: 'Noche' }).soporte).toBe(0);
  });

  it('curvaPorFactor varía solo ese factor', () => {
    const esc: Escenario = { clima: 'Lluvia', calzada: 'Húmeda', franja: 'Noche' };
    const curva = curvaPorFactor(modelo, esc, 'clima');
    expect(curva.map((c) => c.escenario.clima)).toEqual([...CLIMAS]);
    expect(curva.every((c) => c.escenario.calzada === 'Húmeda' && c.escenario.franja === 'Noche')).toBe(true);
    expect(curva[CLIMAS.indexOf('Lluvia')].indice).toBeCloseTo(estimar(modelo, esc).indice, 12);
    expect(curvaPorFactor(modelo, esc, 'franja').length).toBe(FRANJAS.length);
    expect(curvaPorFactor(modelo, esc, 'calzada').length).toBe(CALZADAS.length);
  });

  it('mide la calidad con siniestros que no vio y la reporta con honestidad', () => {
    expect(modelo.calidad).not.toBeNull();
    expect(modelo.calidad!.auc).toBeGreaterThan(0.55);
    expect(modelo.calidad!.evaluadoCon).toBeGreaterThan(1000);
  });

  it('con pocos siniestros no evalúa pero sí estima', () => {
    const pocos = entrenarModelo(datos.slice(0, 120))!;
    expect(pocos.calidad).toBeNull();
    expect(Number.isFinite(estimar(pocos, BASE).indice)).toBe(true);
  });

  it('un intervalo con más datos es más estrecho', () => {
    const poco = entrenarModelo(datos.slice(0, 600))!;
    const ancho = (m: typeof modelo) => {
      const e = estimar(m, BASE);
      return e.pGraveIC[1] - e.pGraveIC[0];
    };
    expect(ancho(modelo)).toBeLessThan(ancho(poco));
  });

  it('es determinista', () => {
    const a = estimar(entrenarModelo(datos)!, BASE);
    const b = estimar(entrenarModelo(datos)!, BASE);
    expect(a).toEqual(b);
  });
});

describe('Datos de ejemplo', () => {
  const datos = generarSiniestros();
  const modelo = entrenarModelo(datos)!;

  it('entrena rápido con 8 000 siniestros', () => {
    const t0 = performance.now();
    entrenarModelo(datos);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('encuentra los efectos que el generador sembró en la gravedad', () => {
    // el generador multiplica la gravedad en madrugada (×1,7) y con clima adverso (×1,3);
    // una calzada con derrumbe tiene muy pocos casos, así que no se prueba: su estimación es muy imprecisa
    const madrugada = estimar(modelo, { ...BASE, franja: 'Madrugada' }).pGrave;
    const manana = estimar(modelo, BASE).pGrave;
    expect(madrugada).toBeGreaterThan(manana);
    const adverso = estimar(modelo, { clima: 'Lluvia fuerte', calzada: 'Húmeda', franja: 'Mañana' }).pGrave;
    expect(adverso).toBeGreaterThan(manana);
  });

  it('dice con honestidad que las condiciones explican poco de la gravedad', () => {
    // la gravedad de los datos de ejemplo depende sobre todo del tipo de vehículo, que este modelo no usa
    expect(modelo.calidad!.auc).toBeGreaterThan(0.5);
    expect(modelo.calidad!.auc).toBeLessThan(0.7);
  });
});

describe('Lectura honesta de una estimación', () => {
  it('solo dice mayor o menor si todo el intervalo queda de un lado', () => {
    const ic = (a: number, b: number): Intervalo => [a, b];
    expect(compararConReferencia(ic(1.2, 2.0), 1)).toBe('mayor');
    expect(compararConReferencia(ic(0.4, 0.8), 1)).toBe('menor');
    expect(compararConReferencia(ic(0.8, 1.3), 1)).toBe('similar');
    // justo en el borde cuenta como no concluyente
    expect(compararConReferencia(ic(1, 2), 1)).toBe('similar');
    expect(compararConReferencia(ic(0.5, 1), 1)).toBe('similar');
  });

  it('con datos de ejemplo, la lluvia nocturna sobre calzada húmeda es claramente más frecuente que el promedio', () => {
    const datos = generarSiniestros();
    const modelo = entrenarModelo(datos)!;
    const lectura = leerEstimacion(modelo, estimar(modelo, { clima: 'Lluvia', calzada: 'Húmeda', franja: 'Noche' }));
    expect(lectura.frecuencia).toBe('mayor');
  });

  it('estimacionesATabla trae una fila por combinación y tantas celdas como columnas', () => {
    const modelo = entrenarModelo(generarSiniestros())!;
    const tabla = estimacionesATabla(estimarTodas(modelo));
    expect(tabla.filas).toHaveLength(60);
    for (const f of tabla.filas) expect(f).toHaveLength(tabla.columnas.length);
    // los porcentajes salen en 0-100, no en 0-1
    const iPct = tabla.columnas.indexOf('% grave o mortal');
    for (const f of tabla.filas) {
      expect(Number(f[iPct])).toBeGreaterThan(1);
      expect(Number(f[iPct])).toBeLessThan(100);
    }
  });
});

describe('Redacción de una estimación', () => {
  const modelo = entrenarModelo(generarSiniestros())!;
  const base = estimar(modelo, { clima: 'Despejado', calzada: 'Seca', franja: 'Mañana' });
  const conIC = (cambios: Partial<typeof base>) => ({ ...base, ...cambios });

  it('cuando todo es mayor, lo dice con cifras', () => {
    const frase = redactarEstimacion(modelo, conIC({
      frecuencia: 2.4, frecuenciaIC: [2, 2.9], pGrave: 0.4, pGraveIC: [0.36, 0.44],
    }));
    expect(frase).toContain('veces la frecuencia promedio');
    expect(frase).toContain('más probable que sean graves');
    expect(frase).toContain('Despejado');
  });

  it('si ni la frecuencia ni la gravedad se distinguen del promedio, no inventa diferencias', () => {
    const frase = redactarEstimacion(modelo, conIC({
      frecuencia: 1.05, frecuenciaIC: [0.9, 1.2], pGrave: modelo.base.pGrave, pGraveIC: [modelo.base.pGrave - 0.02, modelo.base.pGrave + 0.02],
    }));
    expect(frase).toContain('ni la frecuencia ni la gravedad');
    expect(frase).not.toContain('más probable');
  });

  it('usa «pero» cuando una cosa sube y la otra baja', () => {
    const frase = redactarEstimacion(modelo, conIC({
      frecuencia: 0.5, frecuenciaIC: [0.4, 0.6], pGrave: 0.5, pGraveIC: [modelo.base.pGrave + 0.05, 0.6],
    }));
    expect(frase).toContain('menos frecuentes');
    expect(frase).toContain(', pero ');
    expect(frase).toContain('más probable que sean graves');
  });

  it('una gravedad indistinguible se dice con esas palabras aunque la frecuencia sea distinta', () => {
    const frase = redactarEstimacion(modelo, conIC({
      frecuencia: 1.8, frecuenciaIC: [1.5, 2.1], pGrave: modelo.base.pGrave, pGraveIC: [modelo.base.pGrave - 0.03, modelo.base.pGrave + 0.03],
    }));
    expect(frase).toContain('su gravedad no se distingue del promedio');
  });
});
