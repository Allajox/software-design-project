import {
  Anio, CALZADAS_ADVERSAS, CLIMAS_ADVERSOS, CondicionPersona, Clima, DiaSemana, EstadoCalzada,
  FranjaHoraria, Genero, Provincia, RangoEdad, Ruta, Severidad, TipoVehiculo, UBICACIONES,
} from '../models/catalogos';
import { Siniestro } from '../models/siniestro.models';

/**
 * Generador de datos de EJEMPLO. Sirve para desarrollar el dashboard sin backend.
 * Es determinista: la misma semilla produce siempre los mismos registros.
 * Se reemplazará por la carga real de datos del COSEVI/MOPT (RF-1).
 */

type Rng = () => number;
type Ponderado<T> = readonly (readonly [T, number])[];

/** Generador pseudoaleatorio con semilla (mulberry32) */
function crearRng(semilla: number): Rng {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function elegir<T>(rng: Rng, opciones: Ponderado<T>): T {
  const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
  let r = rng() * total;
  for (const [valor, peso] of opciones) {
    r -= peso;
    if (r <= 0) return valor;
  }
  return opciones[opciones.length - 1][0];
}

const NOMBRE_DIA: DiaSemana[] = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Más siniestros hacia el fin de semana y en los meses lluviosos/festivos */
const PESO_DIA = [0.9, 0.8, 0.8, 0.85, 0.9, 1.1, 1.05];
const PESO_MES = [1.0, 0.9, 0.95, 0.95, 1.0, 1.0, 1.05, 1.0, 1.0, 1.05, 1.1, 1.2];
const PESO_MAX = 1.1 * 1.2;

const PESO_PROVINCIA: Ponderado<Provincia> = [
  ['San José', 31], ['Alajuela', 18], ['Cartago', 9], ['Heredia', 10],
  ['Guanacaste', 11], ['Puntarenas', 12], ['Limón', 9],
];

const RUTAS_POR_PROVINCIA: Record<Provincia, Ponderado<Ruta>> = {
  'San José': [['Ruta 39', 5], ['Ruta 27', 4], ['Ruta 2', 4], ['Ruta 1', 3], ['Ruta 3', 2], ['Ruta 32', 1]],
  'Alajuela': [['Ruta 1', 5], ['Ruta 3', 4], ['Ruta 27', 3], ['Ruta 35', 2], ['Ruta 4', 2]],
  'Cartago': [['Ruta 2', 5], ['Ruta 10', 3], ['Ruta 39', 2]],
  'Heredia': [['Ruta 3', 4], ['Ruta 5', 4], ['Ruta 1', 3], ['Ruta 4', 2]],
  'Guanacaste': [['Ruta 1', 6], ['Ruta 21', 5], ['Ruta 18', 2]],
  'Puntarenas': [['Ruta 27', 5], ['Ruta 34', 4], ['Ruta 17', 3], ['Ruta 23', 2], ['Ruta 1', 1]],
  'Limón': [['Ruta 32', 6], ['Ruta 36', 4], ['Ruta 4', 1]],
};

/** Tiempos de respuesta más largos lejos del Gran Área Metropolitana */
const FACTOR_RESPUESTA: Record<Provincia, number> = {
  'San José': 0.8, 'Heredia': 0.85, 'Cartago': 0.95, 'Alajuela': 1.0,
  'Puntarenas': 1.35, 'Guanacaste': 1.4, 'Limón': 1.45,
};

const FRANJAS_PESO: Ponderado<FranjaHoraria> = [['Madrugada', 12], ['Mañana', 26], ['Tarde', 33], ['Noche', 29]];
const VEHICULOS_PESO: Ponderado<TipoVehiculo> = [
  ['Automóvil', 35],
  ['Motocicleta', 25],
  ['Pick up', 10],
  ['Bicicleta', 3],
  ['Rural', 5],
  ['Autobús', 5],
  ['Taxi', 4],
  ['Microbús', 3],
  ['Camión', 5],
  ['Cabezal con remolque', 2],
  ['Cabezal sin remolque', 1],
  ['Vagoneta', 1],
  ['Cisterna', 1],
  ['Grúa', 1],
  ['Ambulancia', 1],
  ['Vehículo con remolque', 1],
  ['Otros', 2],
];
const MULT_VEHICULO: Record<TipoVehiculo, number> = {
  'Motocicleta': 2.4,
  'Automóvil': 0.7,
  'Pick up': 0.9,
  'Bicicleta': 2.2,
  'Rural': 0.8,
  'Autobús': 1.0,
  'Taxi': 0.8,
  'Microbús': 1.0,
  'Camión': 1.7,
  'Cabezal con remolque': 1.7,
  'Cabezal sin remolque': 1.7,
  'Vagoneta': 1.5,
  'Cisterna': 1.7,
  'Grúa': 1.5,
  'Ambulancia': 1.0,
  'Vehículo con remolque': 1.3,
  'Otros': 1.0,
};

const CLIMA_LLUVIOSO: Ponderado<Clima> = [
  ['Buen tiempo', 15],
  ['Lluvia', 50],
  ['Neblina', 10],
  ['Lluvia con neblina', 25],
];
const CLIMA_SECO: Ponderado<Clima> = [
  ['Buen tiempo', 75],
  ['Lluvia', 10],
  ['Neblina', 10],
  ['Lluvia con neblina', 5],
];
const CALZADA_POR_CLIMA: Record<Clima, Ponderado<EstadoCalzada>> = {
  'Buen tiempo': [
    ['Buena', 70],
    ['Huecos', 15],
    ['Resbaladiza', 5],
    ['Construcción o reparación', 5],
    ['Hundimientos', 2],
    ['Otros', 3],
  ],

  'Lluvia': [
    ['Buena', 35],
    ['Huecos', 15],
    ['Resbaladiza', 35],
    ['Construcción o reparación', 5],
    ['Hundimientos', 5],
    ['Otros', 5],
  ],

  'Neblina': [
    ['Buena', 55],
    ['Huecos', 15],
    ['Resbaladiza', 15],
    ['Construcción o reparación', 5],
    ['Hundimientos', 5],
    ['Otros', 5],
  ],

  'Lluvia con neblina': [
    ['Buena', 25],
    ['Huecos', 15],
    ['Resbaladiza', 40],
    ['Construcción o reparación', 5],
    ['Hundimientos', 10],
    ['Otros', 5],
  ],
};

function pesosCondicion(v: TipoVehiculo): Ponderado<CondicionPersona> {
  switch (v) {
    case 'Motocicleta':
    case 'Bicicleta':
      return [['Conductor', 80], ['Acompañante', 12], ['Peatón', 8]];

    case 'Autobús':
    case 'Microbús':
      return [['Conductor', 30], ['Acompañante', 40], ['Peatón', 30]];

    case 'Camión':
    case 'Cabezal con remolque':
    case 'Cabezal sin remolque':
    case 'Cisterna':
    case 'Vagoneta':
      return [['Conductor', 55], ['Acompañante', 10], ['Peatón', 35]];

    default:
      return [['Conductor', 62], ['Acompañante', 20], ['Peatón', 18]];
  }
}

function pesosEdad(v: TipoVehiculo): Ponderado<RangoEdad> {
  switch (v) {
    case 'Motocicleta':
      return [['18-25', 30], ['26-40', 45], ['41-60', 20], ['>60', 5]];

    case 'Bicicleta':
      return [['18-25', 20], ['26-40', 30], ['41-60', 30], ['>60', 20]];

    case 'Camión':
    case 'Cabezal con remolque':
    case 'Cabezal sin remolque':
    case 'Cisterna':
    case 'Vagoneta':
      return [['18-25', 5], ['26-40', 35], ['41-60', 50], ['>60', 10]];

    case 'Autobús':
    case 'Microbús':
      return [['18-25', 10], ['26-40', 30], ['41-60', 40], ['>60', 20]];

    default:
      return [['18-25', 18], ['26-40', 36], ['41-60', 30], ['>60', 16]];
  }
}
const PCT_MASCULINO: Record<TipoVehiculo, number> = {
  'Motocicleta': 86,
  'Automóvil': 66,
  'Pick up': 75,
  'Bicicleta': 82,
  'Rural': 70,
  'Autobús': 70,
  'Taxi': 70,
  'Microbús': 70,
  'Camión': 95,
  'Cabezal con remolque': 95,
  'Cabezal sin remolque': 95,
  'Vagoneta': 90,
  'Cisterna': 95,
  'Grúa': 90,
  'Ambulancia': 70,
  'Vehículo con remolque': 75,
  'Otros': 70,
};

/**
 * «Puntos negros» de los datos de ejemplo: tramos donde los siniestros se concentran (y, en algunos,
 * a una hora preferida). Sirven para que la detección de hotspots (RF-6) tenga algo que encontrar y
 * para probarla: las pruebas comprueban que el algoritmo los descubre. Es ficción: no corresponden
 * a tramos reales de la red vial.
 */
export interface PuntoNegroDemo {
  ruta: Ruta;
  km: number;
  /** Peso relativo dentro de su ruta */
  peso: number;
  /** Hora en la que se concentra (si la hay) */
  franja?: FranjaHoraria;
}

export const PUNTOS_NEGROS_DEMO: readonly PuntoNegroDemo[] = [
  { ruta: 'Ruta 27', km: 38, peso: 3, franja: 'Noche' },
  { ruta: 'Ruta 27', km: 82, peso: 2 },
  { ruta: 'Ruta 1', km: 24, peso: 3, franja: 'Tarde' },
  { ruta: 'Ruta 1', km: 71, peso: 2, franja: 'Madrugada' },
  { ruta: 'Ruta 39', km: 12, peso: 3, franja: 'Tarde' },
  { ruta: 'Ruta 2', km: 55, peso: 2, franja: 'Madrugada' },
  { ruta: 'Ruta 3', km: 18, peso: 2, franja: 'Mañana' },
  { ruta: 'Ruta 32', km: 63, peso: 3, franja: 'Noche' },
  { ruta: 'Ruta 21', km: 47, peso: 2 },
  { ruta: 'Ruta 34', km: 29, peso: 2, franja: 'Noche' },
];

/** Parte de los siniestros de una ruta con puntos negros que cae en ellos (el resto se reparte parejo) */
const PROB_PUNTO_NEGRO = 0.35;
/** Qué tan «abierto» es cada punto negro, en km (distribución logística: ~90 % cae a ±1,8 km) */
const ESCALA_PUNTO_NEGRO_KM = 0.6;

/**
 * Convierte UN número aleatorio `u` en un kilómetro. Las rutas sin puntos negros usan el mismo
 * cálculo de siempre (parejo entre 1 y 120). Se usa un solo sorteo para no alterar el resto de la
 * secuencia aleatoria: los demás datos de ejemplo siguen siendo exactamente los mismos.
 */
function elegirKilometro(u: number, ruta: Ruta): { km: number; franja?: FranjaHoraria } {
  const puntos = PUNTOS_NEGROS_DEMO.filter((p) => p.ruta === ruta);
  if (puntos.length === 0) return { km: 1 + Math.floor(u * 120) };
  if (u >= PROB_PUNTO_NEGRO) return { km: 1 + Math.floor(((u - PROB_PUNTO_NEGRO) / (1 - PROB_PUNTO_NEGRO)) * 120) };

  const total = puntos.reduce((suma, p) => suma + p.peso, 0);
  let objetivo = (u / PROB_PUNTO_NEGRO) * total;
  for (const p of puntos) {
    if (objetivo < p.peso || p === puntos[puntos.length - 1]) {
      const t = Math.min(1 - 1e-6, Math.max(1e-6, objetivo / p.peso));
      const km = Math.round(p.km + ESCALA_PUNTO_NEGRO_KM * Math.log(t / (1 - t)));
      // una parte de los siniestros del punto negro ocurre a su hora típica
      const aLaHora = p.franja !== undefined && (t * 7919) % 1 < 0.4;
      return { km: Math.min(120, Math.max(1, km)), franja: aLaHora ? p.franja : undefined };
    }
    objetivo -= p.peso;
  }
  return { km: 1 + Math.floor(u * 120) };
}


function elegirFecha(rng: Rng): Date {
  const inicio = Date.UTC(2023, 0, 1);
  const dias = Math.round((Date.UTC(2025, 11, 31) - inicio) / 86_400_000) + 1;

  for (;;) {
    const fecha = new Date(inicio + Math.floor(rng() * dias) * 86_400_000);
    const peso = PESO_DIA[fecha.getUTCDay()] * PESO_MES[fecha.getUTCMonth()];

    if (rng() * PESO_MAX <= peso) return fecha;
  }
}

function crearSiniestro(rng: Rng): Omit<Siniestro, 'id'> {
  const fecha = elegirFecha(rng);
  const mes = fecha.getUTCMonth() + 1;
  const lluvioso = mes >= 5 && mes <= 11;

  const provincia = elegir(rng, PESO_PROVINCIA);
  const cantones = Object.keys(UBICACIONES[provincia]);
  const canton = elegir(rng, cantones.map((c, i) => [c, Math.max(1, 4 - i)] as const));
  const distritos = UBICACIONES[provincia][canton];
  const distrito = elegir(rng, distritos.map((d, i) => [d, Math.max(1, 3 - i)] as const));
  const ruta = elegir(rng, RUTAS_POR_PROVINCIA[provincia]);

  const franja = elegir(rng, FRANJAS_PESO);
  const vehiculo = elegir(rng, VEHICULOS_PESO);
  const clima = elegir(rng, lluvioso || provincia === 'Limón' ? CLIMA_LLUVIOSO : CLIMA_SECO);
  const calzada = elegir(rng, CALZADA_POR_CLIMA[clima]);
  const senalizacion = rng() < 0.78;

  const condicion = elegir(rng, pesosCondicion(vehiculo));
  const edad = elegir(rng, pesosEdad(vehiculo));
  const genero: Genero = rng() * 100 < PCT_MASCULINO[vehiculo] ? 'Masculino' : 'Femenino';

  // Gravedad: más probable con motos/bicicletas, peatones, mal clima, madrugada y sin señalización
  const adverso = CLIMAS_ADVERSOS.includes(clima) || CALZADAS_ADVERSAS.includes(calzada);
  const multiplicador =
    MULT_VEHICULO[vehiculo] *
    (condicion === 'Peatón' ? 2.6 : 1) *
    (adverso ? 1.3 : 1) *
    (franja === 'Madrugada' ? 1.7 : 1) *
    (senalizacion ? 1 : 1.3);
  const pFallecido = Math.min(0.45, 0.035 * multiplicador);
  const pGrave = Math.min(0.5, 0.16 * Math.sqrt(multiplicador));
  const u = rng();
  const severidad: Severidad = u < pFallecido ? 'Con muertos o graves' : u < pFallecido + pGrave ? 'Fallecido' : 'Solo heridos leves';

  let fallecidos = 0;
  let heridosGraves = 0;
  let heridosLeves = 0;
  if (severidad === 'Fallecido') {
    fallecidos = elegir(rng, [[1, 85], [2, 13], [3, 2]] as const);
    heridosGraves = elegir(rng, [[0, 60], [1, 30], [2, 10]] as const);
    heridosLeves = elegir(rng, [[0, 60], [1, 30], [2, 10]] as const);
  } else if (severidad === 'Con muertos o graves') {
    heridosGraves = elegir(rng, [[1, 80], [2, 15], [3, 5]] as const);
    heridosLeves = elegir(rng, [[0, 60], [1, 30], [2, 10]] as const);
  } else {
    heridosLeves = elegir(rng, [[1, 70], [2, 22], [3, 8]] as const);
  }

  // Tiempo de respuesta: base de 12 min + cola exponencial, ajustada por zona y condiciones
  const exponencial = -Math.log(1 - rng()) * 10;
  const tiempoRespuestaMin = Math.max(
    4,
    Math.min(
      180,
      Math.round(
        (12 + exponencial) *
          FACTOR_RESPUESTA[provincia] *
          (franja === 'Madrugada' ? 1.2 : 1) *
          (CLIMAS_ADVERSOS.includes(clima) ? 1.25 : 1) *
          (CALZADAS_ADVERSAS.includes(calzada) ? 1.5 : 1),
      ),
    ),
  );

  const ubicacion = elegirKilometro(rng(), ruta);

  return {
    fecha: fecha.toISOString().slice(0, 10),
    anio: fecha.getUTCFullYear() as Anio,
    mes,
    diaSemana: NOMBRE_DIA[fecha.getUTCDay()],
    franja: ubicacion.franja ?? franja,
    provincia,
    canton,
    distrito,
    ruta,
    kilometro: ubicacion.km,
    vehiculo,
    severidad,
    fallecidos,
    heridosGraves,
    heridosLeves,
    clima,
    calzada,
    senalizacion,
    edad,
    genero,
    condicion,
    tiempoRespuestaMin,
  };
}

export const SEMILLA_DEMO = 20260519;
export const CANTIDAD_DEMO = 8000;

export function generarSiniestros(cantidad = CANTIDAD_DEMO, semilla = SEMILLA_DEMO): Siniestro[] {
  const rng = crearRng(semilla);
  return Array.from({ length: cantidad }, () => crearSiniestro(rng))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((s, i) => ({ ...s, id: i + 1 }));
}
