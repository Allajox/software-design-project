import { ClaveFiltro, Filtros, Siniestro } from '../models/siniestro.models';

/** Una lista vacía significa "sin restricción" */
const incluye = <T>(lista: readonly T[], valor: T): boolean => lista.length === 0 || lista.includes(valor);

/**
 * Aplica los filtros cruzados (RF-2) a una lista de siniestros. Función pura.
 *
 * `ignorar` permite excluir algunos filtros del cálculo. Se usa para que un gráfico
 * que filtra su propia dimensión (p. ej. el ranking de provincias) siga mostrando
 * todas las opciones y no solo la que ya está seleccionada.
 */
export function aplicarFiltros(
  datos: readonly Siniestro[],
  f: Filtros,
  ignorar: readonly ClaveFiltro[] = [],
): Siniestro[] {
  const ign = (clave: ClaveFiltro) => ignorar.includes(clave);

  return datos.filter(
    (s) =>
      (ign('provincia') || !f.provincia || s.provincia === f.provincia) &&
      (ign('canton') || !f.canton || s.canton === f.canton) &&
      (ign('distrito') || !f.distrito || s.distrito === f.distrito) &&
      (ign('ruta') || !f.ruta || s.ruta === f.ruta) &&
      (ign('anios') || incluye(f.anios, s.anio)) &&
      (ign('meses') || incluye(f.meses, s.mes)) &&
      (ign('dias') || incluye(f.dias, s.diaSemana)) &&
      (ign('franjas') || incluye(f.franjas, s.franja)) &&
      (ign('vehiculos') || incluye(f.vehiculos, s.vehiculo)) &&
      (ign('severidades') || incluye(f.severidades, s.severidad)) &&
      (ign('climas') || incluye(f.climas, s.clima)) &&
      (ign('calzadas') || incluye(f.calzadas, s.calzada)) &&
      (ign('edades') || incluye(f.edades, s.edad)) &&
      (ign('generos') || incluye(f.generos, s.genero)),
  );
}

/** Cuenta cuántos filtros tienen alguna selección (no cuántas opciones) */
export function contarFiltrosActivos(f: Filtros): number {
  return Object.values(f).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== '')).length;
}
