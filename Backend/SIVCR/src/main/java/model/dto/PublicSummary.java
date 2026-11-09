package model.dto;

import java.util.List;

public record PublicSummary(long totalIncidents, KPIValue tsv, String topProvince,List<ProvinceCount> incidentsByProvince, List<YearCount> yearlyEvolution) {
    public record ProvinceCount(String province, long incidents) { }
    public record YearCount(int year, long incidents) { }
}
