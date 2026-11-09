import { MESES } from '../models/catalogos';
import { Filtros } from '../models/siniestro.models';

/**
 * Describe los filtros activos en frases cortas ("Provincia: Limón", "Año: 2024, 2025").
 * Se usa en el historial de consultas y en los reportes exportados (CSV, Excel, PDF).
 */
export function resumirFiltros(f: Filtros): string[] {
  const lista = (etiqueta: string, valores: readonly (string | number)[]): string[] =>
    valores.length ? [`${etiqueta}: ${valores.join(', ')}`] : [];
  const texto = (etiqueta: string, valor: string): string[] => (valor ? [`${etiqueta}: ${valor}`] : []);

  return [
    ...texto('Provincia', f.provincia),
    ...texto('Cantón', f.canton),
    ...texto('Distrito', f.distrito),
    ...texto('Ruta', f.ruta),
    ...lista('Año', [...f.anios].sort()),
    ...lista('Mes', [...f.meses].sort((a, b) => a - b).map((m) => MESES[m - 1])),
    ...lista('Día', f.dias),
    ...lista('Franja', f.franjas),
    ...lista('Vehículo', f.vehiculos),
    ...lista('Severidad', f.severidades),
    ...lista('Clima', f.climas),
    ...lista('Calzada', f.calzadas),
    ...lista('Edad', f.edades),
    ...lista('Género', f.generos),
  ];
}
