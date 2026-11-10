package model.dto;

import java.util.List;
import java.util.Map;

/**
 * Valores con los que se llenan las listas de filtros del dashboard (GET /api/dashboard/opciones). Salen de los datos
 * reales y usan las etiquetas del frontend, las mismas que DashboardFilters entiende ("San José", "Ruta 27").
 *
 * @param provincias las siete provincias
 * @param cantones   cantones que tienen siniestros, por provincia
 * @param distritos  distritos que tienen siniestros, por cantón (los nombres de cantón no se repiten entre provincias)
 * @param rutas      rutas nacionales con siniestros, en orden numérico
 * @param anios      años con siniestros, de menor a mayor
 * @param vehiculos  tipos de vehículo registrados en las personas, sin los valores vacíos ni "No aplica"
 */
public record OpcionesPanel(
        List<String> provincias,
        Map<String, List<String>> cantones,
        Map<String, List<String>> distritos,
        List<String> rutas,
        List<Integer> anios,
        List<String> vehiculos) { }
