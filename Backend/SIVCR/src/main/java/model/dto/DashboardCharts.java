package model.dto;

import java.util.List;

public record DashboardCharts(HeatmapData heatmap, List<ParetoPoint> pareto, VictimsByGenderAge victims, List<FatalityByVehicle> fatalityByVehicle) { }
