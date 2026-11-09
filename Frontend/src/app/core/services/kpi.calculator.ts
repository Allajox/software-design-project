import { CALZADAS_ADVERSAS, CLIMAS_ADVERSOS, TipoVehiculo } from '../models/catalogos';
import { Kpis, Siniestro } from '../models/siniestro.models';

/**
 * Fórmulas de los KPIs (sección 3.4 del documento). Funciones puras, sin Angular:
 * se pueden probar y reutilizar desde cualquier capa.
 */

/**
 * Pesos del Índice de Severidad (ISS). El documento nombra W1, W2 y W3 pero no da valores:
 * estos son supuestos de trabajo y se pueden ajustar en un solo lugar.
 */
export const PESOS_SEVERIDAD = { w1Fallecidos: 10, w2Graves: 5, w3Leves: 1 } as const;
export type PesosSeveridad = typeof PESOS_SEVERIDAD;

const porcentaje = (parte: number, total: number): number => (total > 0 ? (parte / total) * 100 : 0);

/** 3.4.1 TSV = (N incidencias en la región / N total de incidencias) × 100 */
export function calcularTSV(incidenciasRegion: number, totalIncidencias: number): number {
  return porcentaje(incidenciasRegion, totalIncidencias);
}

/** 3.4.2 ISS = (W1·N fallecidos + W2·N graves + W3·N leves) / N total de incidencias */
export function calcularISS(
  registros: readonly Siniestro[],
  pesos: PesosSeveridad = PESOS_SEVERIDAD,
): number {
  if (registros.length === 0) return 0;
  const ponderado = registros.reduce(
    (suma, s) =>
      suma + pesos.w1Fallecidos * s.fallecidos + pesos.w2Graves * s.heridosGraves + pesos.w3Leves * s.heridosLeves,
    0,
  );
  return ponderado / registros.length;
}

/** 3.4.3 TPR = Σ tiempo de respuesta (min) / N total de incidencias */
export function calcularTPR(registros: readonly Siniestro[]): number {
  if (registros.length === 0) return 0;
  return registros.reduce((suma, s) => suma + s.tiempoRespuestaMin, 0) / registros.length;
}

/** 3.4.4 TFv = % de accidentes de un tipo de vehículo con al menos un fallecido */
export function calcularTFv(registros: readonly Siniestro[], tipo: TipoVehiculo): number {
  const deEseTipo = registros.filter((s) => s.vehiculo === tipo);
  const conFallecido = deEseTipo.filter((s) => s.fallecidos > 0).length;
  return porcentaje(conFallecido, deEseTipo.length);
}

/** 3.4.5 IC = % de incidencias bajo condiciones adversas (clima adverso o derrumbe en la calzada) */
export function calcularIC(registros: readonly Siniestro[]): number {
  const adversas = registros.filter(
    (s) => CLIMAS_ADVERSOS.includes(s.clima) || CALZADAS_ADVERSAS.includes(s.calzada),
  ).length;
  return porcentaje(adversas, registros.length);
}

/**
 * Calcula todos los KPIs de una selección.
 * @param filtrados siniestros que cumplen todos los filtros
 * @param totalNacional siniestros del país bajo los filtros NO geográficos (denominador del TSV)
 * @param totalRegistros siniestros registrados sin ningún filtro
 */
export function calcularKpis(
  filtrados: readonly Siniestro[],
  totalNacional: number,
  totalRegistros: number,
): Kpis {
  const fallecidos = filtrados.reduce((s, r) => s + r.fallecidos, 0);
  const heridosGraves = filtrados.reduce((s, r) => s + r.heridosGraves, 0);
  const heridosLeves = filtrados.reduce((s, r) => s + r.heridosLeves, 0);

  return {
    siniestros: filtrados.length,
    totalRegistros,
    tsv: calcularTSV(filtrados.length, totalNacional),
    iss: calcularISS(filtrados),
    tpr: calcularTPR(filtrados),
    victimas: fallecidos + heridosGraves + heridosLeves,
    fallecidos,
    heridosGraves,
    heridosLeves,
    ic: calcularIC(filtrados),
  };
}
