// Data Transfer Object
package model.dto;

import java.util.List;

public record HeatmapData(List<String> days, List<String> slots, int[][] z) { }
