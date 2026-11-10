package model.export;

import java.time.LocalDateTime;
import java.util.List;
import model.Sinister;
import model.dto.KPIResult;

/**
 * Lo que lleva un reporte: el ámbito (los filtros aplicados, en texto), cuándo se generó, el resumen de KPI (null si el
 * formato no lo usa) y los siniestros VALIDO que cumplen los filtros.
 */
public record ReportData(String ambito, LocalDateTime generado, KPIResult kpis, List<Sinister> registros) { }
