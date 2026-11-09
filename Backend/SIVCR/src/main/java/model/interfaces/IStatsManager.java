//Interface del StatsManager 
package model.interfaces;


import java.util.List;
import model.FilterCriteria;
import model.dto.DashboardCharts;
import model.dto.HeatmapData;
import model.dto.KPIResult;
import model.dto.ParetoPoint;
import model.dto.PublicSummary;

//Todos los métodos de filtros interpretan los valores "sin filtro" con:
//null en los campos de objeto y 0 en año, mes, edadMin y edadMax.

public interface IStatsManager {

    //TSV, ISS, TPR y % de condiciones adversas. 
    KPIResult getKPIs(FilterCriteria filters);

    //todos los gráficos del dashboard. 
    DashboardCharts getCharts(FilterCriteria filters);

    //mapa de calor día de la semana × franja horaria. 
    HeatmapData getHeatmap(FilterCriteria filters);

    //Pareto de rutas por número de incidentes. 
    List<ParetoPoint> getPareto(FilterCriteria filters);

    //solo agregados, sin datos personales ni filtros del cliente. 
    PublicSummary getPublicSummary();

    //Texto con los filtros aplicados, para mostrar en tarjetas, Excel y PDF. 
    String describeScope(FilterCriteria filters);
}