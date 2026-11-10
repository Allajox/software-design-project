package model;

import java.util.Set;

/**
 * Configuración del sistema que cambia el resultado de los KPI (HU 30): pesos del ISS y qué valores de clima y calzada
 * cuentan como condición adversa. Hay una sola fila en la base (tabla system_config). Es un record sin dependencias
 * del framework.
 *
 * @param wFallecido     peso W1 del ISS (fallecidos)
 * @param wHeridoGrave   peso W2 (heridos graves)
 * @param wHeridoLeve    peso W3 (heridos leves)
 * @param climaAdverso   nombres de enum Climate adversos (ej. LLUVIA)
 * @param calzadaAdversa nombres de enum RoadStatus adversos (ej. RESBALADIZA)
 */
public record SystemConfig(double wFallecido, double wHeridoGrave, double wHeridoLeve,
                           Set<String> climaAdverso, Set<String> calzadaAdversa) {

    public SystemConfig {
        climaAdverso = Set.copyOf(climaAdverso);
        calzadaAdversa = Set.copyOf(calzadaAdversa);
    }

    /** Pesos provisionales de la migración V2 y sin condiciones adversas, si la fila de la base no existiera. */
    public static SystemConfig porOmision() {
        return new SystemConfig(10, 5, 1, Set.of(), Set.of());
    }
}
