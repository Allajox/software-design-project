import { FiltrosPanel } from '../models/filtros-panel';
import { CriteriosApi } from './modelos-api';

/** «Mañana» → MANANA, «San José» → SAN_JOSE, «Construcción o reparación» → CONSTRUCCION_O_REPARACION */
export function claveApi(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/** Rango de edad del panel → edadMin / edadMax del backend («>60» no tiene máximo). */
function rangoDeEdad(edad: string): { edadMin?: number; edadMax?: number } {
  const completo = /^(\d+)-(\d+)$/.exec(edad);
  if (completo) return { edadMin: Number(completo[1]), edadMax: Number(completo[2]) };
  const mayor = /^>(\d+)$/.exec(edad);
  if (mayor) return { edadMin: Number(mayor[1]) + 1 };
  return {};
}

/**
 * Filtros del panel → criterios con los que el servidor guarda la consulta (POST /api/queries/saved).
 * El tipo de vehículo NO se guarda: el servidor solo conoce cinco grupos (particular, carga…) y el panel usa los
 * tipos que trae COSEVI, que no se pueden traducir sin adivinar.
 */
export function aCriteriosDelPanel(f: FiltrosPanel): CriteriosApi {
  const c: Record<string, string | number> = {};
  if (f.provincia) c['provincia'] = claveApi(f.provincia);
  if (f.canton) c['canton'] = f.canton;
  if (f.distrito) c['distrito'] = f.distrito;
  if (f.ruta) c['ruta'] = f.ruta.replace(/^Ruta\s+/i, '');
  if (f.anio) c['anio'] = Number(f.anio);
  if (f.mes) c['mes'] = Number(f.mes);
  if (f.dia) c['diaSemana'] = claveApi(f.dia);
  if (f.franja) c['franja'] = claveApi(f.franja);
  if (f.clima) c['clima'] = claveApi(f.clima);
  if (f.calzada) c['calzada'] = claveApi(f.calzada);
  if (f.genero) c['genero'] = claveApi(f.genero);
  Object.assign(c, rangoDeEdad(f.edad));
  return c as CriteriosApi;
}
