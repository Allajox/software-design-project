package model.dto;

import java.util.List;
import model.dto.DashboardPanel.ItemConteo;

/**
 * Respuesta de GET /api/public/summary: solo agregados nacionales de siniestros, nada por registro ni por persona, con
 * la forma que lee el frontend. Es aparte de PublicSummary (el del SAD, que devuelve GET /api/dashboard/public-summary).
 */
public record ResumenPublico(
        long totalSiniestros,
        List<ItemConteo> porAnio,
        List<ItemConteo> porProvincia,
        List<ItemConteo> porSeveridad,
        List<ItemConteo> porFranja) {}
