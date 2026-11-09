import {
  Anio, CondicionPersona, Clima, DiaSemana, EstadoCalzada, FranjaHoraria, Genero,
  Provincia, RangoEdad, Ruta, Severidad, TipoVehiculo,
} from './catalogos';

/** Un siniestro vial registrado (una fila del dataset). */
export interface Siniestro {
  id: number;
  /** Fecha ISO (AAAA-MM-DD) */
  fecha: string;
  anio: Anio;
  /** 1 a 12 */
  mes: number;
  diaSemana: DiaSemana;
  franja: FranjaHoraria;

  provincia: Provincia;
  canton: string;
  distrito: string;
  ruta: Ruta;
  /** Punto kilométrico */
  kilometro: number;
  /** Coordenadas en grados decimales (opcionales: solo si el archivo cargado las trae) */
  latitud?: number;
  longitud?: number;

  vehiculo: TipoVehiculo;
  /** Gravedad máxima del siniestro */
  severidad: Severidad;
  fallecidos: number;
  heridosGraves: number;
  heridosLeves: number;

  clima: Clima;
  calzada: EstadoCalzada;
  senalizacion: boolean;

  /** Perfil de la persona principal involucrada */
  edad: RangoEdad;
  genero: Genero;
  condicion: CondicionPersona;

  /** Minutos que tardaron los cuerpos de atención en llegar */
  tiempoRespuestaMin: number;
}

/** Un siniestro todavía sin número de ID (el sistema lo asigna al guardarlo) */
export type SiniestroNuevo = Omit<Siniestro, 'id'>;

/**
 * Estado de los filtros (RF-2).
 * Texto vacío = "todos". Lista vacía = "sin restricción".
 */
export interface Filtros {
  // Ubicación
  provincia: string;
  canton: string;
  distrito: string;
  ruta: string;
  // Temporalidad
  anios: Anio[];
  meses: number[];
  dias: DiaSemana[];
  franjas: FranjaHoraria[];
  // Clasificación
  vehiculos: TipoVehiculo[];
  severidades: Severidad[];
  climas: Clima[];
  calzadas: EstadoCalzada[];
  edades: RangoEdad[];
  generos: Genero[];
}

export type ClaveFiltro = keyof Filtros;

/** Claves de los filtros que son listas (selección múltiple) */
export type ClaveFiltroLista = {
  [K in keyof Filtros]: Filtros[K] extends readonly unknown[] ? K : never;
}[keyof Filtros];

export const CLAVES_UBICACION: readonly ClaveFiltro[] = ['provincia', 'canton', 'distrito', 'ruta'];

export function filtrosVacios(): Filtros {
  return {
    provincia: '', canton: '', distrito: '', ruta: '',
    anios: [], meses: [], dias: [], franjas: [],
    vehiculos: [], severidades: [], climas: [], calzadas: [], edades: [], generos: [],
  };
}

/** Indicadores clave (sección 3.4 del documento) */
export interface Kpis {
  /** Siniestros que cumplen los filtros */
  siniestros: number;
  /** Siniestros registrados en total, sin ningún filtro */
  totalRegistros: number;
  /** Tasa de Siniestralidad Vial: % respecto al total nacional */
  tsv: number;
  /** Índice de Severidad de Siniestros */
  iss: number;
  /** Tiempo Promedio de Respuesta, en minutos */
  tpr: number;
  victimas: number;
  fallecidos: number;
  heridosGraves: number;
  heridosLeves: number;
  /** Índice de Impacto por Clima / Calzada: % bajo condiciones adversas */
  ic: number;
}
