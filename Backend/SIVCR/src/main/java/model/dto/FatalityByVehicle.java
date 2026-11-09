// Data Transfer Object
package model.dto;

public record FatalityByVehicle(String vehicleType, long total, long fatalities, double fatalityRatePct) { }
