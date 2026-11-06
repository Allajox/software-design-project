// Los dtos son archivos que su unico proposito es la transferencia de datos entre capas, por lo que no deben contener logica de negocio ni metodos que no sean getters y setters.
// Data Transfer Object

package model.dto;

import java.util.List;

public record DashboardCharts(HeatmapData heatmap, List<ParetoPoint> pareto, VictimsByGenderAge victims, List<FatalityByVehicle> fatalityByVehicle) { }
