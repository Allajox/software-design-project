package model.dto;

import java.util.List;
import model.dto.DashboardCharts.ItemConteo;

/** Resumen para la vista pública (GET /api/public/summary): solo agregados, nada por registro. */
public record PublicSummary(
        long totalSiniestros,
        List<ItemConteo> porAnio,
        List<ItemConteo> porProvincia,
        List<ItemConteo> porSeveridad,
        List<ItemConteo> porFranja) {}
