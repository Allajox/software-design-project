import { PUNTOS_NEGROS_DEMO, generarSiniestros } from '../data/generador-siniestros';
import { Ruta } from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';
import {
  Hotspot, PARAMETROS_HOTSPOTS, binomialCola, densidadPorBloque, detectarHotspots, etiquetaTramo,
  hotspotsATabla, nivelDe, normalizarParametros, ordenarHotspots, poissonCola,
} from './hotspots';

/** Generador pseudoaleatorio simple y con semilla, para que las pruebas siempre den lo mismo */
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

/** Siniestros repartidos parejo a lo largo de una ruta (ruido de fondo) */
function ruido(ruta: Ruta, cantidad: number, kmMax: number, semilla = 7): Siniestro[] {
  const rng = crearRng(semilla);
  return Array.from({ length: cantidad }, () => sin({ ruta, kilometro: 1 + Math.floor(rng() * kmMax) }));
}

/** Un amontonamiento de siniestros en [kmDesde, kmHasta] */
function amontonamiento(ruta: Ruta, cantidad: number, kmDesde: number, kmHasta: number, extra: Partial<Siniestro> = {}): Siniestro[] {
  return Array.from({ length: cantidad }, (_, i) =>
    sin({ ruta, kilometro: kmDesde + (i % (kmHasta - kmDesde + 1)), ...extra }),
  );
}

describe('Estadística', () => {
  it('poissonCola coincide con valores conocidos', () => {
    // λ=2: P(X≥3) = 1 − e^-2·(1 + 2 + 2) = 0,3233
    expect(poissonCola(3, 2)).toBeCloseTo(1 - 5 * Math.exp(-2), 10);
    expect(poissonCola(0, 2)).toBe(1);
    expect(poissonCola(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
  });

  it('poissonCola no pierde precisión con probabilidades diminutas', () => {
    const p = poissonCola(20, 1);
    expect(p).toBeGreaterThan(1e-19);
    expect(p).toBeLessThan(2e-19);
  });

  it('poissonCola con media cero: nunca se supera', () => {
    expect(poissonCola(1, 0)).toBe(0);
  });

  it('binomialCola coincide con un cálculo a mano', () => {
    // n=10, p=0,5: P(X≥8) = (45 + 10 + 1) / 1024
    expect(binomialCola(10, 8, 0.5)).toBeCloseTo(56 / 1024, 10);
    expect(binomialCola(10, 0, 0.5)).toBe(1);
    expect(binomialCola(10, 11, 0.5)).toBe(0);
  });
});

describe('detectarHotspots', () => {
  it('encuentra un amontonamiento claro y lo delimita', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 60, 40, 42)];
    const r = detectarHotspots(datos);
    expect(r.hotspots.length).toBe(1);
    const h = r.hotspots[0];
    expect(h.ruta).toBe('Ruta 27');
    expect(h.kmInicio).toBeLessThanOrEqual(41);
    expect(h.kmInicio).toBeGreaterThanOrEqual(38);
    expect(h.kmFin).toBeGreaterThanOrEqual(41);
    expect(h.kmFin).toBeLessThanOrEqual(44);
    expect(h.siniestros).toBeGreaterThanOrEqual(60);
    expect(h.razon).toBeGreaterThan(3);
    expect(h.pAjustado).toBeLessThan(0.001);
  });

  it('no inventa hotspots cuando todo está repartido parejo', () => {
    // 20 rutas con ruido distinto: con la corrección por pruebas múltiples no debe saltar ninguna alarma
    const rutas: Ruta[] = ['Ruta 1', 'Ruta 2', 'Ruta 3', 'Ruta 4', 'Ruta 5', 'Ruta 10', 'Ruta 17', 'Ruta 18'];
    const datos = rutas.flatMap((ruta, i) => ruido(ruta, 250, 120, 100 + i));
    expect(detectarHotspots(datos).hotspots).toEqual([]);
  });

  it('respeta el mínimo de siniestros', () => {
    const datos = [...ruido('Ruta 27', 200, 100), ...amontonamiento('Ruta 27', 15, 50, 51)];
    expect(detectarHotspots(datos, { ...PARAMETROS_HOTSPOTS, minimoSiniestros: 10 }).hotspots.length).toBe(1);
    expect(detectarHotspots(datos, { ...PARAMETROS_HOTSPOTS, minimoSiniestros: 30 }).hotspots).toEqual([]);
  });

  it('une ventanas contiguas en un solo tramo', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 120, 40, 47)];
    const r = detectarHotspots(datos);
    expect(r.hotspots.length).toBe(1);
    expect(r.hotspots[0].kmFin - r.hotspots[0].kmInicio).toBeGreaterThanOrEqual(5);
  });

  it('separa tramos que están lejos y los ordena del más grave al menos grave', () => {
    const datos = [
      ...ruido('Ruta 27', 400, 120),
      ...amontonamiento('Ruta 27', 40, 20, 21, { fallecidos: 0, heridosLeves: 1 }),
      ...amontonamiento('Ruta 27', 40, 90, 91, { fallecidos: 1, heridosLeves: 0, severidad: 'Fallecido' }),
    ];
    const r = detectarHotspots(datos);
    expect(r.hotspots.length).toBe(2);
    expect(r.hotspots[0].kmInicio).toBeGreaterThan(80); // el de fallecidos va primero
    expect(r.hotspots[0].severidadAcumulada).toBeGreaterThan(r.hotspots[1].severidadAcumulada);
    expect(r.hotspots[0].nivel).toBe('critico');
  });

  it('analiza cada ruta por separado', () => {
    const datos = [
      ...ruido('Ruta 27', 300, 100, 1),
      ...ruido('Ruta 2', 300, 100, 2),
      ...amontonamiento('Ruta 2', 60, 10, 11),
    ];
    const r = detectarHotspots(datos);
    expect(r.hotspots.map((h) => h.ruta)).toEqual(['Ruta 2']);
    expect(r.perfilRutas.map((p) => p.ruta)).toEqual(['Ruta 2', 'Ruta 27']);
  });

  it('suma bien víctimas y severidad del tramo', () => {
    const grave = { fallecidos: 1, heridosGraves: 2, heridosLeves: 3 };
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 50, 60, 61, grave)];
    const h = detectarHotspots(datos).hotspots[0];
    const dentro = h.registros.filter((s) => s.fallecidos === 1).length; // los 50 del amontonamiento
    expect(dentro).toBe(50);
    // W1=10, W2=5, W3=1 → 10·1 + 5·2 + 1·3 = 23 por siniestro grave
    expect(h.fallecidos).toBeGreaterThanOrEqual(50);
    expect(h.severidadAcumulada).toBeGreaterThanOrEqual(50 * 23);
    expect(h.iss).toBeCloseTo(h.severidadAcumulada / h.siniestros, 10);
    expect(h.victimas).toBe(h.fallecidos + h.heridosGraves + h.heridosLeves);
    expect(h.siniestrosConFallecidos).toBeGreaterThanOrEqual(50);
  });

  it('la matriz día × franja y los conteos suman los siniestros del tramo', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 60, 30, 31, { franja: 'Noche', diaSemana: 'Sábado' })];
    const h = detectarHotspots(datos).hotspots[0];
    expect(h.matriz.valores.flat().reduce((a, b) => a + b, 0)).toBe(h.siniestros);
    expect(Object.values(h.porFranja).reduce((a, b) => a + b, 0)).toBe(h.siniestros);
    expect(Object.values(h.porDia).reduce((a, b) => a + b, 0)).toBe(h.siniestros);
    expect(Object.values(h.porAnio).reduce((a, b) => a + b, 0)).toBe(h.siniestros);
  });

  it('detecta en qué se concentra el tramo (hora, día, vehículo…)', () => {
    const ruidoVariado = ruido('Ruta 27', 400, 100).map((s, i) => ({
      ...s,
      franja: (['Madrugada', 'Mañana', 'Tarde', 'Noche'] as const)[i % 4],
    }));
    const datos = [
      ...ruidoVariado,
      ...amontonamiento('Ruta 27', 80, 70, 71, { franja: 'Noche', vehiculo: 'Motocicleta', senalizacion: false }),
    ];
    const h = detectarHotspots(datos).hotspots[0];
    const claves = h.hallazgos.map((x) => x.clave);
    expect(claves).toContain('franja');
    expect(claves).toContain('vehiculo');
    expect(claves).toContain('senalizacion');
    const franja = h.hallazgos.find((x) => x.clave === 'franja');
    expect(franja?.texto).toContain('Noche');
    expect(h.hallazgos.length).toBeLessThanOrEqual(5);
  });

  it('no inventa pistas cuando el tramo se parece al resto', () => {
    const datos = [...ruido('Ruta 27', 400, 100), ...amontonamiento('Ruta 27', 60, 70, 71)];
    const h = detectarHotspots(datos).hotspots[0];
    expect(h.hallazgos.find((x) => x.clave === 'franja')).toBeUndefined();
    expect(h.hallazgos.find((x) => x.clave === 'vehiculo')).toBeUndefined();
  });

  it('describe la ubicación con la provincia y cantones más frecuentes', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 60, 40, 41, { canton: 'Santa Ana', provincia: 'San José' })];
    const h = detectarHotspots(datos).hotspots[0];
    expect(h.provincia).toBe('San José');
    expect(h.cantones[0]).toBe('Santa Ana');
  });

  it('ignora (y cuenta) los registros sin kilómetro válido', () => {
    const datos = [...ruido('Ruta 27', 300, 100), sin({ kilometro: Number.NaN }), sin({ kilometro: -3 })];
    const r = detectarHotspots(datos);
    expect(r.sinKilometro).toBe(2);
    expect(r.siniestrosAnalizados).toBe(300);
  });

  it('con datos vacíos o muy pocos devuelve un resultado vacío sin errores', () => {
    const vacio = detectarHotspots([]);
    expect(vacio.hotspots).toEqual([]);
    expect(vacio.porcentajeEnHotspots).toBe(0);
    expect(vacio.tramosEvaluados).toBe(0);

    const pocos = detectarHotspots(ruido('Ruta 27', 4, 50));
    expect(pocos.hotspots).toEqual([]);
    expect(pocos.perfilRutas[0].analizada).toBe(false);
  });

  it('una exigencia mayor (alfa menor) encuentra igual o menos tramos', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 22, 40, 41)];
    const flexible = detectarHotspots(datos, { ...PARAMETROS_HOTSPOTS, alfa: 0.05 }).hotspots.length;
    const estricta = detectarHotspots(datos, { ...PARAMETROS_HOTSPOTS, alfa: 0.001 }).hotspots.length;
    expect(estricta).toBeLessThanOrEqual(flexible);
  });

  it('el porcentaje en hotspots y los km se calculan sobre lo detectado', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 60, 40, 42)];
    const r = detectarHotspots(datos);
    expect(r.siniestrosEnHotspots).toBe(r.hotspots.reduce((t, h) => t + h.siniestros, 0));
    expect(r.porcentajeEnHotspots).toBeCloseTo((r.siniestrosEnHotspots / r.siniestrosAnalizados) * 100, 10);
    expect(r.kmEnHotspots).toBe(r.hotspots.reduce((t, h) => t + h.kmFin - h.kmInicio + 1, 0));
    expect(r.alfaPorTramo).toBeCloseTo(r.parametros.alfa / r.tramosEvaluados, 12);
  });
});

describe('Parámetros y utilidades', () => {
  it('normaliza parámetros fuera de rango', () => {
    expect(normalizarParametros({ longitudTramoKm: 0, minimoSiniestros: 1, alfa: 5 })).toEqual({
      longitudTramoKm: 1,
      minimoSiniestros: 3,
      alfa: PARAMETROS_HOTSPOTS.alfa,
    });
    expect(normalizarParametros({ longitudTramoKm: Number.NaN, minimoSiniestros: Number.NaN, alfa: Number.NaN })).toEqual(PARAMETROS_HOTSPOTS);
  });

  it('nivelDe compara con el tramo más grave', () => {
    expect(nivelDe(100, 100)).toBe('critico');
    expect(nivelDe(60, 100)).toBe('critico');
    expect(nivelDe(59, 100)).toBe('alto');
    expect(nivelDe(30, 100)).toBe('alto');
    expect(nivelDe(29, 100)).toBe('moderado');
    expect(nivelDe(5, 0)).toBe('moderado');
  });

  it('etiquetaTramo', () => {
    expect(etiquetaTramo({ ruta: 'Ruta 27', kmInicio: 36, kmFin: 40 })).toBe('Ruta 27 · km 36 a 40');
    expect(etiquetaTramo({ ruta: 'Ruta 1', kmInicio: 7, kmFin: 7 })).toBe('Ruta 1 · km 7');
  });

  it('ordenarHotspots por distintos criterios sin tocar la lista original', () => {
    const datos = [
      ...ruido('Ruta 27', 400, 120),
      ...amontonamiento('Ruta 27', 50, 20, 21),
      ...amontonamiento('Ruta 27', 40, 90, 91, { fallecidos: 1, severidad: 'Fallecido' }),
    ];
    const hs = detectarHotspots(datos).hotspots;
    const original = hs.map((h) => h.id);
    expect(ordenarHotspots(hs, 'siniestros')[0].kmInicio).toBeLessThan(40); // el de 50 siniestros
    expect(ordenarHotspots(hs, 'fallecidos')[0].kmInicio).toBeGreaterThan(80);
    expect(ordenarHotspots(hs, 'ruta').map((h) => h.kmInicio)).toEqual([...hs.map((h) => h.kmInicio)].sort((a, b) => a - b));
    expect(hs.map((h) => h.id)).toEqual(original);
  });

  it('densidadPorBloque reparte los siniestros en bloques de km sin perder ninguno', () => {
    const datos = ruido('Ruta 27', 200, 100);
    const r = detectarHotspots(datos);
    const perfil = r.perfilRutas[0];
    const bloques = densidadPorBloque(perfil, 5, r.kmTope);
    expect(bloques.reduce((a, b) => a + b, 0)).toBe(200);
    expect(bloques.length).toBe(Math.ceil((r.kmTope + 1) / 5));
  });
});

describe('hotspotsATabla', () => {
  it('arma una fila por hotspot con puesto, nivel y cifras redondeadas', () => {
    const datos = [...ruido('Ruta 27', 300, 100), ...amontonamiento('Ruta 27', 60, 40, 42, { franja: 'Noche' })];
    const { hotspots } = detectarHotspots(datos);
    const tabla = hotspotsATabla(hotspots);
    expect(tabla.filas.length).toBe(hotspots.length);
    expect(tabla.filas.every((f) => f.length === tabla.columnas.length)).toBe(true);
    const fila = tabla.filas[0];
    expect(fila[0]).toBe(1);
    expect(fila[1]).toBe('Ruta 27');
    expect(fila[6]).toBe('Crítico');
    expect(fila[7]).toBe(hotspots[0].siniestros);
    expect(fila[15]).toBe('< 0,0001');
  });
});

describe('Datos de ejemplo (con puntos negros sembrados)', () => {
  const datos = generarSiniestros();
  const resultado = detectarHotspots(datos);

  it('descubre cada punto negro sembrado', () => {
    for (const p of PUNTOS_NEGROS_DEMO) {
      const encontrado = resultado.hotspots.some((h) => h.ruta === p.ruta && p.km >= h.kmInicio - 1 && p.km <= h.kmFin + 1);
      expect(encontrado, `${p.ruta} km ${p.km}`).toBe(true);
    }
  });

  it('no marca tramos en rutas que no tienen puntos negros', () => {
    const conPuntos = new Set<string>(PUNTOS_NEGROS_DEMO.map((p) => p.ruta));
    const falsos = resultado.hotspots.filter((h) => !conPuntos.has(h.ruta));
    expect(falsos.map((h) => etiquetaTramo(h))).toEqual([]);
  });

  it('detecta la hora típica de los puntos negros nocturnos', () => {
    const h = resultado.hotspots.find((x) => x.ruta === 'Ruta 27' && 38 >= x.kmInicio - 1 && 38 <= x.kmFin + 1) as Hotspot;
    const franja = h.hallazgos.find((x) => x.clave === 'franja');
    expect(franja?.texto).toContain('Noche');
  });

  it('procesa las 8 000 filas rápido', () => {
    const t0 = performance.now();
    detectarHotspots(datos);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
