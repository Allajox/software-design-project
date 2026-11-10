// Los dtos son archivos que su unico proposito es la transferencia de datos entre capas, por lo que no deben contener logica de negocio ni metodos que no sean getters y setters.
// Data Transfer Object

package model.dto;

import java.util.List;

// filtrosNoAplicados: nombres de los filtros del pedido que algún gráfico no puede aplicar porque su tabla no los tiene
// (los gráficos de siniestros no tienen edad ni género; los de personas no tienen ruta, franja, vehículo, severidad,
// clima ni calzada). Se informan para que la pantalla los avise en vez de aparentar que se aplicaron.
public record DashboardCharts(HeatmapData heatmap, List<ParetoPoint> pareto, VictimsByGenderAge victims,
                              List<FatalityByVehicle> fatalityByVehicle, List<String> filtrosNoAplicados) { }
