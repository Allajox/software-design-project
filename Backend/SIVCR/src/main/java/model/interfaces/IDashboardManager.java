// Interface del DashboardManager
package model.interfaces;

import model.dto.DashboardFilters;
import model.dto.DashboardPanel;
import model.dto.OpcionesPanel;
import model.dto.ResumenPublico;

// El panel del dashboard con la forma que lee el frontend. Complementa a IStatsManager (que filtra con FilterCriteria,
// un valor por filtro): este filtra con DashboardFilters, que admite varios valores por filtro y usa las etiquetas del
// frontend ("San José", "Mañana", "Ruta 27"). Texto vacío o lista vacía significa "sin restricción".
public interface IDashboardManager {

    // KPI y todos los gráficos del dashboard con los filtros pedidos.
    DashboardPanel getPanel(DashboardFilters filters);

    // Los valores con los que se llenan las listas de filtros (cantones, distritos, rutas, años, vehículos), de los datos.
    OpcionesPanel getOptions();

    // Solo agregados nacionales de siniestros: sin personas y sin filtros del cliente.
    ResumenPublico getPublicSummary();
}
