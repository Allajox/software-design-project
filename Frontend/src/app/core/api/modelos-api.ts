/**
 * Contratos JSON del backend (Backend/SIVCR). Aquí solo hay tipos: la lógica está en los demás archivos de core/api.
 * Si el backend cambia un nombre, se cambia aquí y el compilador marca todo lo que lo usa.
 */

export type ProvinciaApi = 'SAN_JOSE' | 'ALAJUELA' | 'CARTAGO' | 'HEREDIA' | 'GUANACASTE' | 'PUNTARENAS' | 'LIMON';
export type DiaApi = 'LUNES' | 'MARTES' | 'MIERCOLES' | 'JUEVES' | 'VIERNES' | 'SABADO' | 'DOMINGO';
export type FranjaApi = 'MADRUGADA' | 'MANANA' | 'TARDE' | 'NOCHE';
export type SeveridadApi = 'SOLO_HERIDOS_LEVES' | 'CON_MUERTOS_O_GRAVES' | 'FALLECIDO';
export type ClimaApi = 'BUEN_TIEMPO' | 'LLUVIA' | 'NEBLINA' | 'LLUVIA_CON_NEBLINA';
export type CalzadaApi =
  | 'BUENA' | 'HUECOS' | 'RESBALADIZA' | 'CONSTRUCCION_O_REPARACION' | 'HUNDIMIENTOS' | 'OTROS';
export type FuenteApi = 'COSEVI' | 'MOPT' | 'INEC' | 'IMN';
export type ResultadoCargaApi = 'EXITOSA' | 'PARCIAL' | 'FALLIDA';

/**
 * FilterCriteria del backend. Todo es opcional: lo que no se manda es «sin filtro».
 * Ojo: cuando el backend DEVUELVE criterios (consultas guardadas e historial), anio, mes, edadMin y edadMax
 * vienen como 0 si no hay filtro (ver FilterCriteria.java); `desdeCriterios` lo normaliza.
 * edadMin, edadMax y genero son datos de víctimas: el backend los rechaza (400) en la búsqueda de siniestros.
 */
export interface CriteriosApi {
  provincia?: ProvinciaApi | null;
  canton?: string | null;
  distrito?: string | null;
  ruta?: string | null;
  anio?: number | null;
  mes?: number | null;
  diaSemana?: DiaApi | null;
  franja?: FranjaApi | null;
  tipoVehiculo?: string | null;
  severidad?: SeveridadApi | null;
  clima?: ClimaApi | null;
  calzada?: CalzadaApi | null;
  edadMin?: number | null;
  edadMax?: number | null;
  genero?: string | null;
}

/** model.Sinister. COSEVI no trae vehículo, fecha exacta, coordenadas ni tiempo de respuesta: esos campos vienen null. */
export interface SiniestroApi {
  provincia: ProvinciaApi | null;
  canton: string | null;
  distrito: string | null;
  ruta: string | null;
  km: number | null;
  lat: number | null;
  lon: number | null;
  tipoVehiculo: string | null;
  severidad: SeveridadApi | null;
  clima: ClimaApi | null;
  calzada: CalzadaApi | null;
  tiempoRespuestaMins: number | null;
  calidad: 'VALIDO' | 'INCOMPLETO';
  fecha: string | null;
  anio: number | null;
  mes: number | null;
  diaSemana: DiaApi | null;
  franja: FranjaApi | null;
  victima: unknown;
}

/** model.Page: la página empieza en 0. */
export interface PaginaApi<T> {
  items: T[];
  total: number;
  pagina: number;
  tamano: number;
  totalPaginas: number;
}

export interface ConsultaGuardadaApi {
  id: number;
  nombre: string;
  criterios: CriteriosApi;
  creadoEn: string;
}

export interface ConsultaHistorialApi {
  id: number;
  fecha: string;
  /** Texto legible que arma el servidor */
  resumen: string;
  criterios: CriteriosApi;
}

export interface ConteosCalidadApi {
  validos: number;
  incompletos: number;
  corruptos: number;
  omitidos: number;
}

/** IngestionLog: una carga de archivo. `resumen` es null si la carga falló antes de evaluar registros. */
export interface CargaApi {
  id: number;
  fecha: string;
  fuente: FuenteApi;
  resultado: ResultadoCargaApi;
  usuarioId: number;
  usuario: string | null;
  archivo: string | null;
  perfil: string | null;
  mensaje: string | null;
  checksum: string | null;
  resumen: ConteosCalidadApi | null;
}

/** QualityReport. `errores` son los primeros N (fila y motivo, sin el contenido de las celdas); los contadores son exactos. */
export interface ReporteCalidadApi {
  idCarga: number;
  validos: number;
  incompletos: number;
  corruptos: number;
  omitidos: number;
  errores: string[];
}
