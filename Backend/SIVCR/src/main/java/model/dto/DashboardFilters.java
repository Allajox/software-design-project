package model.dto;

import java.util.List;

/**
 * Filtros del dashboard (RF-2). Llegan como parámetros de la URL; las listas pueden venir
 * repetidas (?anios=2024&anios=2025). Texto vacío o lista vacía = "sin restricción".
 * Los textos usan las etiquetas del front ("San José", "Mañana", "Ruta 27"); StatsManager las traduce.
 */
public record DashboardFilters(
        String provincia, String canton, String distrito, String ruta,
        List<Integer> anios, List<Integer> meses, List<String> dias, List<String> franjas,
        List<String> vehiculos, List<String> severidades, List<String> climas, List<String> calzadas,
        List<String> edades, List<String> generos) {

    public DashboardFilters {
        anios = nz(anios); meses = nz(meses); dias = nz(dias); franjas = nz(franjas);
        vehiculos = nz(vehiculos); severidades = nz(severidades); climas = nz(climas);
        calzadas = nz(calzadas); edades = nz(edades); generos = nz(generos);
    }

    public static DashboardFilters vacio() {
        return new DashboardFilters(null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static <T> List<T> nz(List<T> lista) {
        return lista == null ? List.of() : lista;
    }
}
