import { Filtros } from './siniestro.models';

/** Combinación de filtros a la que el usuario le puso nombre (RF-5) */
export interface ConsultaGuardada {
  id: string;
  nombre: string;
  filtros: Filtros;
  /** Fecha y hora ISO */
  creadaEn: string;
}

/** Consulta que el sistema anotó solo, porque la persona la estuvo usando */
export interface ConsultaReciente {
  id: string;
  filtros: Filtros;
  fecha: string;
}

/** Todo lo que se guarda por usuario */
export interface AlmacenConsultas {
  guardadas: ConsultaGuardada[];
  recientes: ConsultaReciente[];
}
