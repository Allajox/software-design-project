package model.dto;

import java.util.List;

/**
 * Respuesta de GET /api/dashboard: el panel completo con la forma que ya lee el frontend (EstadisticasService).
 * Los nombres de los campos son los del frontend; no cambiarlos sin cambiar también el cliente.
 *
 * Es aparte de DashboardCharts (los gráficos del SAD, con FilterCriteria): este se arma con DashboardFilters, que admite
 * varios valores por filtro.
 */
public record DashboardPanel(
        Kpis kpis,
        List<ItemConteo> porProvincia,
        List<ItemVehiculo> porVehiculo,
        List<ItemConteo> porSeveridad,
        List<ItemRuta> rutasPrincipales,
        MatrizDiaFranja matrizDiaFranja,
        PerfilDemografico perfilDemografico) {

    /**
     * tpr es null cuando la fuente no trae tiempos de respuesta (COSEVI no los trae). iss es 0 si no hay datos
     * suficientes: el frontend espera un número.
     */
    public record Kpis(long siniestros, long totalRegistros, double tsv, double iss, Double tpr,
                       long victimas, long fallecidos, long heridosGraves, long heridosLeves, double ic) {}

    public record ItemConteo(String etiqueta, long valor, double porcentaje) {}

    public record ItemVehiculo(String etiqueta, long valor, double porcentaje, double tasaFatalidad) {}

    public record ItemRuta(String etiqueta, long valor, double porcentaje, double acumulado) {}

    public record MatrizDiaFranja(List<String> dias, List<String> franjas, List<List<Long>> valores, long maximo) {}

    public record PerfilDemografico(List<String> edades, List<Long> masculino, List<Long> femenino) {}
}
