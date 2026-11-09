import { generarSiniestros } from '../data/generador-siniestros';
import { FranjaHoraria } from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';
import {
  ALCANCE_NACIONAL, Alcance, MEDIDAS_POR_DEFECTO, Medidas, aniosDeDatos, copiarMedidas, describirAlcance, detectabilidad,
  enAlcance, esAlcanceNacional, normalizarEfecto, normalizarMedidas, probabilidadDeEvitar, simular, simulacionATabla,
  sonMedidasPorDefecto, fijarEfecto,
} from './simulacion';

let contador = 0;
const sin = (extra: Partial<Siniestro> = {}): Siniestro => ({
  id: ++contador,
  fecha: '2025-03-14',
  anio: 2025,
  mes: 3,
  diaSemana: 'Viernes',
  franja: 'Mañana',
  provincia: 'San José',
  canton: 'San José',
  distrito: 'Carmen',
  ruta: 'Ruta 1',
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
  tiempoRespuestaMin: 20,
  ...extra,
});

const solo = (cambios: Partial<Medidas['senalizacion']>, patrulla: Partial<Medidas['patrullaje']> = {}): Medidas => ({
  senalizacion: { ...MEDIDAS_POR_DEFECTO.senalizacion, ...cambios, efecto: { ...MEDIDAS_POR_DEFECTO.senalizacion.efecto, ...(cambios.efecto ?? {}) } },
  patrullaje: { ...MEDIDAS_POR_DEFECTO.patrullaje, activa: false, ...patrulla },
});

describe('Alcance', () => {
  const a = sin({ provincia: 'Cartago', ruta: 'Ruta 2', kilometro: 40 });

  it('sin restricciones, entra todo', () => {
    expect(enAlcance(a, ALCANCE_NACIONAL)).toBe(true);
    expect(esAlcanceNacional(ALCANCE_NACIONAL)).toBe(true);
  });
  it('filtra por provincia y por ruta', () => {
    expect(enAlcance(a, { ...ALCANCE_NACIONAL, provincia: 'Cartago' })).toBe(true);
    expect(enAlcance(a, { ...ALCANCE_NACIONAL, provincia: 'Limón' })).toBe(false);
    expect(enAlcance(a, { ...ALCANCE_NACIONAL, ruta: 'Ruta 2' })).toBe(true);
    expect(enAlcance(a, { ...ALCANCE_NACIONAL, ruta: 'Ruta 3' })).toBe(false);
  });
  it('el rango de kilómetros incluye los extremos y solo cuenta con una ruta elegida', () => {
    const ruta: Alcance = { provincia: '', ruta: 'Ruta 2', kmDesde: 40, kmHasta: 45 };
    expect(enAlcance(a, ruta)).toBe(true);
    expect(enAlcance(a, { ...ruta, kmDesde: 41 })).toBe(false);
    expect(enAlcance(a, { ...ruta, kmDesde: null, kmHasta: 39 })).toBe(false);
    // el kilómetro cuenta entero: 40,7 pertenece al «km 40»
    const medio = sin({ ruta: 'Ruta 2', kilometro: 40.7 });
    expect(enAlcance(medio, { provincia: '', ruta: 'Ruta 2', kmDesde: 40, kmHasta: 40 })).toBe(true);
    expect(enAlcance(medio, { provincia: '', ruta: 'Ruta 2', kmDesde: 41, kmHasta: null })).toBe(false);
    // sin ruta, los kilómetros se ignoran
    expect(enAlcance(a, { provincia: '', ruta: '', kmDesde: 90, kmHasta: 99 })).toBe(true);
  });
  it('se describe en palabras', () => {
    expect(describirAlcance(ALCANCE_NACIONAL)).toBe('Todo el país');
    expect(describirAlcance({ provincia: '', ruta: 'Ruta 27', kmDesde: 36, kmHasta: 40 })).toBe('Ruta 27 · km 36 a 40');
    expect(describirAlcance({ provincia: 'Cartago', ruta: '', kmDesde: null, kmHasta: null })).toBe('Cartago');
    expect(describirAlcance({ provincia: '', ruta: 'Ruta 1', kmDesde: 5, kmHasta: null })).toBe('Ruta 1 · desde el km 5');
  });
});

describe('Supuestos', () => {
  it('el efecto queda ordenado y entre 0 y 100', () => {
    expect(normalizarEfecto({ minimo: 20, central: 10, maximo: 5 })).toEqual({ minimo: 10, central: 10, maximo: 10 });
    expect(normalizarEfecto({ minimo: -5, central: 50, maximo: 140 })).toEqual({ minimo: 0, central: 50, maximo: 100 });
    expect(normalizarEfecto({ minimo: Number.NaN, central: 8, maximo: Number.NaN })).toEqual({ minimo: 0, central: 8, maximo: 8 });
  });
  it('las franjas se ordenan como el catálogo y se descartan las inexistentes', () => {
    const m = normalizarMedidas({ ...MEDIDAS_POR_DEFECTO, patrullaje: { ...MEDIDAS_POR_DEFECTO.patrullaje, franjas: ['Noche', 'Mañana', 'Marte' as FranjaHoraria] } });
    expect(m.patrullaje.franjas).toEqual(['Mañana', 'Noche']);
  });
  it('detecta si está en los valores por defecto', () => {
    expect(sonMedidasPorDefecto(MEDIDAS_POR_DEFECTO)).toBe(true);
    const otra = copiarMedidas(MEDIDAS_POR_DEFECTO);
    otra.patrullaje.efecto.central = 12;
    expect(sonMedidasPorDefecto(otra)).toBe(false);
    // copiar no comparte referencias
    expect(MEDIDAS_POR_DEFECTO.patrullaje.efecto.central).toBe(10);
  });
});

describe('Editar el rango del efecto', () => {
  const base = { minimo: 5, central: 10, maximo: 20 };
  it('lo que se escribe es lo que queda, y los demás se mueven solo si hace falta', () => {
    expect(fijarEfecto(base, 'central', 12)).toEqual({ minimo: 5, central: 12, maximo: 20 });
    expect(fijarEfecto(base, 'central', 30)).toEqual({ minimo: 5, central: 30, maximo: 30 });
    expect(fijarEfecto(base, 'central', 2)).toEqual({ minimo: 2, central: 2, maximo: 20 });
    expect(fijarEfecto(base, 'minimo', 15)).toEqual({ minimo: 15, central: 15, maximo: 20 });
    expect(fijarEfecto(base, 'minimo', 25)).toEqual({ minimo: 25, central: 25, maximo: 25 });
    expect(fijarEfecto(base, 'maximo', 8)).toEqual({ minimo: 5, central: 8, maximo: 8 });
    expect(fijarEfecto(base, 'maximo', 3)).toEqual({ minimo: 3, central: 3, maximo: 3 });
  });
  it('recorta a 0-100 y no cambia el original', () => {
    expect(fijarEfecto(base, 'maximo', 500).maximo).toBe(100);
    expect(fijarEfecto(base, 'minimo', -4).minimo).toBe(0);
    expect(base).toEqual({ minimo: 5, central: 10, maximo: 20 });
  });
});

describe('Probabilidad de evitar un siniestro', () => {
  it('la señalización solo actúa donde hoy no hay señalización', () => {
    const m = solo({ cobertura: 100 });
    expect(probabilidadDeEvitar(sin({ senalizacion: true }), m, 'central')).toBe(0);
    expect(probabilidadDeEvitar(sin({ senalizacion: false }), m, 'central')).toBeCloseTo(0.08, 12);
  });
  it('la cobertura reduce el alcance de la señalización', () => {
    const m = solo({ cobertura: 50 });
    expect(probabilidadDeEvitar(sin({ senalizacion: false }), m, 'central')).toBeCloseTo(0.04, 12);
  });
  it('el patrullaje solo actúa en las franjas elegidas', () => {
    const m = solo({ activa: false }, { activa: true, franjas: ['Noche'] });
    expect(probabilidadDeEvitar(sin({ franja: 'Mañana' }), m, 'central')).toBe(0);
    expect(probabilidadDeEvitar(sin({ franja: 'Noche' }), m, 'central')).toBeCloseTo(0.1, 12);
  });
  it('dos medidas sobre el mismo siniestro se combinan sin pasar de 100 %', () => {
    const m: Medidas = { senalizacion: { activa: true, cobertura: 100, efecto: { minimo: 0, central: 50, maximo: 100 } }, patrullaje: { activa: true, franjas: ['Noche'], efecto: { minimo: 0, central: 50, maximo: 100 } } };
    const s = sin({ senalizacion: false, franja: 'Noche' });
    expect(probabilidadDeEvitar(s, m, 'central')).toBeCloseTo(0.75, 12); // 1 − 0,5 × 0,5, no 1,0
    expect(probabilidadDeEvitar(s, m, 'maximo')).toBe(1);
    expect(probabilidadDeEvitar(s, m, 'minimo')).toBe(0);
  });
  it('sin medidas activas no se evita nada', () => {
    const m: Medidas = { senalizacion: { ...MEDIDAS_POR_DEFECTO.senalizacion, activa: false }, patrullaje: { ...MEDIDAS_POR_DEFECTO.patrullaje, activa: false } };
    expect(probabilidadDeEvitar(sin({ senalizacion: false, franja: 'Noche' }), m, 'maximo')).toBe(0);
  });
});

describe('Años de los datos', () => {
  it('cuenta del primer al último día', () => {
    expect(aniosDeDatos([sin({ fecha: '2023-01-01' }), sin({ fecha: '2025-12-31' })])).toBeCloseTo(3, 1);
  });
  it('con un solo día no da cero', () => {
    expect(aniosDeDatos([sin()])).toBeGreaterThan(0);
  });
  it('con datos sin fecha válida usa 1', () => {
    expect(aniosDeDatos([sin({ fecha: 'no es fecha' })])).toBe(1);
    expect(aniosDeDatos([])).toBe(1);
  });
});

describe('Simulación', () => {
  // 100 siniestros durante exactamente 1 año: 40 sin señalización (de los cuales 20 en la noche), 60 con
  const datos: Siniestro[] = [];
  for (let i = 0; i < 100; i++) {
    datos.push(sin({
      fecha: i === 0 ? '2025-01-01' : i === 99 ? '2025-12-31' : '2025-06-15',
      senalizacion: i >= 40,
      franja: i < 20 || (i >= 40 && i < 60) ? 'Noche' : 'Mañana',
      fallecidos: i < 10 ? 1 : 0,
      heridosGraves: i < 10 ? 0 : i < 30 ? 1 : 0,
    }));
  }
  const medidas = (): Medidas => ({
    senalizacion: { activa: true, cobertura: 100, efecto: { minimo: 0, central: 10, maximo: 20 } },
    patrullaje: { activa: true, franjas: ['Noche'], efecto: { minimo: 0, central: 10, maximo: 20 } },
  });

  it('sin siniestros en el alcance devuelve null', () => {
    expect(simular(datos, { ...ALCANCE_NACIONAL, provincia: 'Limón' }, medidas())).toBeNull();
    expect(simular([], ALCANCE_NACIONAL, medidas())).toBeNull();
  });

  it('la base cuenta los siniestros del alcance, por año', () => {
    const r = simular(datos, ALCANCE_NACIONAL, medidas())!;
    expect(r.siniestros).toBe(100);
    expect(r.anios).toBeCloseTo(1, 1);
    expect(r.base.siniestrosAnio).toBeCloseTo(100, -1);
    expect(r.base.fallecidosAnio).toBeCloseTo(10, 0);
    expect(r.cobertura.sinSenalizacionPct).toBe(40);
    expect(r.cobertura.enFranjasPct).toBe(40);
    // alcanzados: sin señal (40: i<40) ∪ noche (i<20 ∪ 40..59) = 0..39 ∪ 40..59 = 60
    expect(r.cobertura.alcanzadosPct).toBe(60);
    // por franja: noche = 0..19 y 40..59 (40), mañana el resto (60); las demás, ninguno
    expect(r.cobertura.porFranjaPct.Noche).toBe(40);
    expect(r.cobertura.porFranjaPct['Mañana']).toBe(60);
    expect(r.cobertura.porFranjaPct.Madrugada).toBe(0);
    expect(Object.values(r.cobertura.porFranjaPct).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });

  it('el efecto central evita lo que dice la cuenta a mano', () => {
    const r = simular(datos, ALCANCE_NACIONAL, medidas())!;
    // 0..19: sin señal y noche → 1 − 0,9 × 0,9 = 0,19 (20 siniestros)
    // 20..39: sin señal, mañana → 0,10 (20)
    // 40..59: con señal, noche → 0,10 (20)
    // 60..99: nada
    const esperado = 20 * 0.19 + 20 * 0.1 + 20 * 0.1;
    expect(r.impacto.central.siniestrosEvitados).toBeCloseTo(esperado, 10);
    expect(r.impacto.central.reduccionPct).toBeCloseTo(esperado, 10); // sobre 100 siniestros
    // fallecidos: solo i<10 (todos con prob 0,19)
    expect(r.impacto.central.fallecidosEvitados).toBeCloseTo(10 * 0.19, 10);
  });

  it('el mínimo no evita nada y el máximo evita más que el central', () => {
    const r = simular(datos, ALCANCE_NACIONAL, medidas())!;
    expect(r.impacto.minimo.siniestrosEvitados).toBe(0);
    expect(r.impacto.maximo.siniestrosEvitados).toBeGreaterThan(r.impacto.central.siniestrosEvitados);
  });

  it('dos medidas juntas evitan menos que la suma de cada una sola (se superponen)', () => {
    const r = simular(datos, ALCANCE_NACIONAL, medidas())!;
    const a = r.porMedida.senalizacion!.siniestrosEvitados;
    const b = r.porMedida.patrullaje!.siniestrosEvitados;
    expect(a).toBeCloseTo(4, 10);
    expect(b).toBeCloseTo(4, 10);
    // 20 siniestros reciben las dos medidas: juntas evitan 0,19 cada uno y no 0,20; la diferencia es 20 × 0,1 × 0,1
    expect(r.impacto.central.siniestrosEvitados).toBeLessThan(a + b);
    expect(r.impacto.central.siniestrosEvitados).toBeCloseTo(a + b - 20 * 0.1 * 0.1, 10);
  });

  it('una medida desactivada no aparece por separado', () => {
    const m = medidas();
    m.patrullaje.activa = false;
    const r = simular(datos, ALCANCE_NACIONAL, m)!;
    expect(r.porMedida.patrullaje).toBeNull();
    expect(r.porMedida.senalizacion).not.toBeNull();
    expect(r.impacto.central.siniestrosEvitados).toBeCloseTo(r.porMedida.senalizacion!.siniestrosEvitados, 10);
  });

  it('el ISS baja si la medida alcanza los siniestros más graves, y no cambia si no los distingue', () => {
    const r = simular(datos, ALCANCE_NACIONAL, medidas())!;
    expect(r.impacto.central.issDespues).toBeLessThan(r.base.iss);
    // una medida que actúa por igual sobre todos los siniestros (cobertura y efecto parejos en todas las franjas) no cambia el promedio
    const pareja: Medidas = {
      senalizacion: { activa: false, cobertura: 100, efecto: { minimo: 0, central: 0, maximo: 0 } },
      patrullaje: { activa: true, franjas: ['Madrugada', 'Mañana', 'Tarde', 'Noche'], efecto: { minimo: 5, central: 10, maximo: 20 } },
    };
    const rp = simular(datos, ALCANCE_NACIONAL, pareja)!;
    expect(rp.impacto.central.issDespues).toBeCloseTo(rp.base.iss, 10);
  });

  it('el TSV del alcance baja, y no se mueve cuando el alcance es todo el país', () => {
    const ruta2 = [...datos, ...Array.from({ length: 100 }, () => sin({ ruta: 'Ruta 2', fecha: '2025-06-15' }))];
    const enRuta1 = simular(ruta2, { ...ALCANCE_NACIONAL, ruta: 'Ruta 1' }, medidas())!;
    expect(enRuta1.base.tsv).toBe(50);
    expect(enRuta1.impacto.central.tsvDespues).toBeLessThan(50);
    const pais = simular(ruta2, ALCANCE_NACIONAL, medidas())!;
    expect(pais.base.tsv).toBe(100);
    expect(pais.impacto.central.tsvDespues).toBeCloseTo(100, 10);
  });

  it('con datos de ejemplo, activar más medidas nunca evita menos', () => {
    const todos = generarSiniestros();
    const soloSenal = simular(todos, ALCANCE_NACIONAL, solo({}))!;
    const ambas = simular(todos, ALCANCE_NACIONAL, MEDIDAS_POR_DEFECTO)!;
    expect(ambas.impacto.central.siniestrosEvitados).toBeGreaterThan(soloSenal.impacto.central.siniestrosEvitados);
    expect(ambas.anios).toBeGreaterThan(2.9);
    expect(ambas.anios).toBeLessThan(3.1);
  });

  it('la tabla para descargar trae las tres hipótesis y es coherente con el cálculo', () => {
    const r = simular(datos, ALCANCE_NACIONAL, medidas())!;
    const t = simulacionATabla(r, medidas());
    expect(t.filas).toHaveLength(3);
    for (const f of t.filas) expect(f).toHaveLength(t.columnas.length);
    expect(t.filas[1][1]).toBeCloseTo(r.impacto.central.siniestrosEvitados / r.anios, 1);
    expect(t.filas[0][1]).toBe(0);
  });
});

describe('¿Se notaría la mejora?', () => {
  it('menos de una desviación no se nota; entre 1 y 2 es dudosa; desde 2 se nota', () => {
    expect(detectabilidad(3, 10).nivel).toBe('no-se-notaria');
    expect(detectabilidad(15, 10).nivel).toBe('dudosa');
    expect(detectabilidad(25, 10).nivel).toBe('se-notaria');
  });
  it('sin ruido (o sin siniestros) no divide por cero', () => {
    expect(detectabilidad(5, 0)).toEqual({ nivel: 'no-se-notaria', veces: 0 });
  });
});
