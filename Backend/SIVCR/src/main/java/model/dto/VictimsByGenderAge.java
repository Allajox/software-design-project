// Data Transfer Object
package model.dto;

import java.util.List;

public record VictimsByGenderAge(List<String> ageRanges, List<Series> series) {
    public record Series(String gender, List<Long> counts) { }
}
