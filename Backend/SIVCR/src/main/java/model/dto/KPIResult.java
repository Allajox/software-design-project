// Data Transfer Object
package model.dto;

import java.util.List;

public record KPIResult(long totalRecords, Tsv tsv, KPIValue iss, KPIValue tpr, KPIValue adverseConditionsPct) {
    public record Tsv(KPIValue global, long nationalTotal, List<ZoneShare> byProvince, List<ZoneShare> byRoute) { }
}
