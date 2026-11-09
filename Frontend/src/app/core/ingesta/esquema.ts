import {
  CALZADAS, CLIMAS, CONDICIONES, DIAS, EDADES, FRANJAS, GENEROS, PROVINCIAS, SEVERIDADES, VEHICULOS,
} from '../models/catalogos';
import { claveCabecera, claveValor } from './normalizar';

/**
 * Esquema del archivo de ingesta (RF-1): qué columnas se esperan, cuáles son obligatorias
 * y con qué nombres alternativos pueden venir. Es la ÚNICA fuente: el validador, la guía que
 * se muestra en pantalla y la plantilla descargable salen de aquí.
 */
export interface CampoEsquema {
  /** Nombre interno (coincide con la propiedad de Siniestro, salvo `hora` e `id`) */
  clave: string;
  /** Nombre con el que se muestra y se escribe en la plantilla */
  titulo: string;
  /** Otros nombres de columna aceptados (se comparan sin tildes, mayúsculas ni símbolos) */
  alias: readonly string[];
  obligatorio: boolean;
  /** Obligatorio "en grupo": basta con que venga una de las columnas del grupo */
  grupo?: 'horario';
  /** Qué valores o formato se aceptan, en una frase */
  formato: string;
  ejemplo: string;
  /** El sistema no usa esta columna (se reconoce para no mostrarla como "desconocida") */
  ignorar?: boolean;
}

export const CAMPOS: readonly CampoEsquema[] = [
  { clave: 'fecha', titulo: 'Fecha', obligatorio: true, alias: ['fecha_siniestro', 'fecha_accidente', 'date'],
    formato: 'AAAA-MM-DD o DD/MM/AAAA (puede incluir la hora)', ejemplo: '2025-03-14' },
  { clave: 'hora', titulo: 'Hora', obligatorio: false, grupo: 'horario', alias: ['hora_siniestro', 'time'],
    formato: 'HH:MM (24 horas). Se usa para calcular la franja', ejemplo: '07:45' },
  { clave: 'franja', titulo: 'Franja', obligatorio: false, grupo: 'horario', alias: ['franja_horaria'],
    formato: FRANJAS.join(', '), ejemplo: 'Mañana' },
  { clave: 'provincia', titulo: 'Provincia', obligatorio: true, alias: ['province'],
    formato: PROVINCIAS.join(', '), ejemplo: 'San José' },
  { clave: 'canton', titulo: 'Cantón', obligatorio: true, alias: [],
    formato: 'Texto. Si no está en el catálogo de referencia se importa con una advertencia', ejemplo: 'Escazú' },
  { clave: 'distrito', titulo: 'Distrito', obligatorio: false, alias: [],
    formato: 'Texto (opcional; si falta se guarda «No indicado»)', ejemplo: 'San Rafael' },
  { clave: 'ruta', titulo: 'Ruta', obligatorio: true, alias: ['ruta_nacional', 'route'],
    formato: 'Número de ruta nacional: «Ruta 27», «27» o «RN27»', ejemplo: 'Ruta 27' },
  { clave: 'kilometro', titulo: 'Km', obligatorio: true, alias: ['punto_kilometrico', 'pk', 'kilometraje'],
    formato: 'Número entre 0 y 700', ejemplo: '14' },
  { clave: 'vehiculo', titulo: 'Vehículo', obligatorio: true, alias: ['tipo_vehiculo', 'tipo_de_vehiculo'],
    formato: VEHICULOS.join(', '), ejemplo: 'Motocicleta' },
  { clave: 'severidad', titulo: 'Severidad', obligatorio: true, alias: ['gravedad', 'severity'],
    formato: `${SEVERIDADES.join(', ')} (la mayor entre las víctimas)`, ejemplo: 'Grave' },
  { clave: 'fallecidos', titulo: 'Fallecidos', obligatorio: true, alias: ['muertos'],
    formato: 'Número entero, 0 o más', ejemplo: '0' },
  { clave: 'heridosGraves', titulo: 'Heridos graves', obligatorio: true, alias: [],
    formato: 'Número entero, 0 o más', ejemplo: '1' },
  { clave: 'heridosLeves', titulo: 'Heridos leves', obligatorio: true, alias: [],
    formato: 'Número entero, 0 o más', ejemplo: '0' },
  { clave: 'clima', titulo: 'Clima', obligatorio: true, alias: ['estado_clima', 'estado_del_clima'],
    formato: CLIMAS.join(', '), ejemplo: 'Lluvia' },
  { clave: 'calzada', titulo: 'Calzada', obligatorio: true, alias: ['estado_calzada', 'estado_de_la_calzada'],
    formato: CALZADAS.join(', '), ejemplo: 'Húmeda' },
  { clave: 'senalizacion', titulo: 'Señalización', obligatorio: true, alias: ['presencia_senalizacion', 'presencia_de_senalizacion'],
    formato: 'Sí o No', ejemplo: 'Sí' },
  { clave: 'edad', titulo: 'Edad', obligatorio: true, alias: ['rango_edad', 'rango_de_edad'],
    formato: `${EDADES.join(', ')} (o la edad en años)`, ejemplo: '26-40' },
  { clave: 'genero', titulo: 'Género', obligatorio: true, alias: ['sexo'],
    formato: GENEROS.join(', '), ejemplo: 'Masculino' },
  { clave: 'condicion', titulo: 'Condición', obligatorio: true, alias: ['condicion_persona', 'rol'],
    formato: CONDICIONES.join(', '), ejemplo: 'Conductor' },
  { clave: 'tiempoRespuestaMin', titulo: 'Respuesta (min)', obligatorio: true,
    alias: ['tiempo_respuesta', 'tiempo_de_respuesta', 'tiempo_respuesta_min', 'tpr'],
    formato: 'Minutos hasta la llegada de los cuerpos de atención (número)', ejemplo: '18' },
  { clave: 'latitud', titulo: 'Latitud', obligatorio: false, alias: ['lat'],
    formato: 'Grados decimales dentro de Costa Rica (5,4 a 11,3). Va junto con la longitud', ejemplo: '9.9341' },
  { clave: 'longitud', titulo: 'Longitud', obligatorio: false, alias: ['lon', 'lng', 'long'],
    formato: 'Grados decimales dentro de Costa Rica (-87,2 a -82,5)', ejemplo: '-84.0877' },
  { clave: 'diaSemana', titulo: 'Día', obligatorio: false, alias: ['dia_semana', 'dia_de_la_semana'],
    formato: `Opcional: se calcula con la fecha (${DIAS.join(', ')}). Si viene y no coincide, se avisa`, ejemplo: 'Viernes' },
  { clave: 'id', titulo: 'ID', obligatorio: false, ignorar: true, alias: [],
    formato: 'Se ignora: el sistema asigna su propio número', ejemplo: '1' },
];

export const CAMPO_POR_CLAVE: ReadonlyMap<string, CampoEsquema> = new Map(CAMPOS.map((c) => [c.clave, c]));

/** nombre de columna normalizado → campo del esquema */
const POR_NOMBRE: ReadonlyMap<string, CampoEsquema> = new Map(
  CAMPOS.flatMap((c) => [c.clave, c.titulo, ...c.alias].map((n) => [claveCabecera(n), c] as const)),
);

export function campoDeCabecera(cabecera: string): CampoEsquema | undefined {
  return POR_NOMBRE.get(claveCabecera(cabecera));
}

/** Columnas de la plantilla descargable: todas menos las que el sistema calcula o ignora */
export const CAMPOS_PLANTILLA = CAMPOS.filter((c) => !c.ignorar && c.clave !== 'hora' && c.clave !== 'diaSemana');

// ---------- Sinónimos: lo que la gente escribe → el valor del catálogo ----------

type Sinonimos = Record<string, string>;
const construir = (catalogo: readonly string[], extra: Record<string, readonly string[]> = {}): Sinonimos => {
  const mapa: Sinonimos = {};
  for (const v of catalogo) mapa[claveValor(v)] = v;
  for (const [canonico, lista] of Object.entries(extra)) for (const s of lista) mapa[claveValor(s)] = canonico;
  return mapa;
};

export const SINONIMOS: Record<string, Sinonimos> = {
  franja: construir(FRANJAS),
  provincia: construir(PROVINCIAS),
  vehiculo: construir(VEHICULOS, {
    'Motocicleta': ['moto', 'motos', 'motocicletas'],
    'Bicicleta': ['bici', 'bicicletas'],
    'Transporte público': ['bus', 'autobus', 'buseta', 'taxi', 'transporte publico'],
    'Carga pesada': ['camion', 'trailer', 'cabezal', 'pesado', 'vehiculo de carga'],
    'Particular': ['carro', 'auto', 'automovil', 'vehiculo particular', 'liviano'],
  }),
  severidad: construir(SEVERIDADES, {
    'Fallecido': ['fatal', 'mortal', 'muerte', 'fallecidos'],
    'Grave': ['graves'],
    'Leve': ['leves', 'ligero', 'ligera'],
  }),
  clima: construir(CLIMAS, {
    'Despejado': ['soleado', 'sol', 'claro'],
    'Lluvia': ['lluvioso', 'lloviendo', 'llovizna'],
    'Lluvia fuerte': ['aguacero', 'tormenta', 'lluvia intensa'],
    'Neblina': ['niebla', 'bruma'],
  }),
  calzada: construir(CALZADAS, {
    'Húmeda': ['mojada', 'humedo', 'mojado'],
    'Derrumbe': ['deslizamiento', 'derrumbes'],
    'Seca': ['seco'],
  }),
  genero: construir(GENEROS, { 'Masculino': ['m', 'hombre', 'h'], 'Femenino': ['f', 'mujer'] }),
  condicion: construir(CONDICIONES, {
    'Conductor': ['chofer', 'piloto'],
    'Acompañante': ['pasajero', 'pasajera', 'ocupante'],
    'Peatón': ['peaton', 'peatona'],
  }),
  diaSemana: construir(DIAS, {
    'Lunes': ['lun'], 'Martes': ['mar'], 'Miércoles': ['mie', 'mier'], 'Jueves': ['jue'],
    'Viernes': ['vie'], 'Sábado': ['sab'], 'Domingo': ['dom'],
  }),
};

export const CATALOGO_DE: Record<string, readonly string[]> = {
  franja: FRANJAS, provincia: PROVINCIAS, vehiculo: VEHICULOS, severidad: SEVERIDADES, clima: CLIMAS,
  calzada: CALZADAS, genero: GENEROS, condicion: CONDICIONES, diaSemana: DIAS,
};
