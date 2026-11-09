package model.ingestion.profile;

import model.ingestion.profile.FieldCatalog.Target;

/**
 * Cómo se interpreta el texto de una columna. Los tipos "de formato" (HOUR_RANGE, TIME_BAND_RANGE,
 * WEEKDAY_LABEL, MONTH_LABEL) cubren las codificaciones que usa COSEVI ("20:00-20:59", "7.Sábado", "D. Abril")
 * pero son genéricos: cualquier fuente puede reutilizarlos desde su YAML.
 */
public enum FieldType {
    /** Texto libre (recortado, con longitud máxima). */
    STRING(Target.TEXT),
    /** Entero. */
    INTEGER(Target.SHORT, Target.INT),
    /** Número decimal (acepta coma o punto decimal). */
    DECIMAL(Target.DOUBLE),
    /** Valor de una lista cerrada: se traduce con el mapa "valores" de la columna. */
    CHOICE(Target.TEXT),
    /** Latitud en grados decimales. */
    LATITUDE(Target.DOUBLE),
    /** Longitud en grados decimales. */
    LONGITUDE(Target.DOUBLE),
    /** Fecha o fecha y hora (ISO o el patrón "formato" de la columna). */
    DATE(Target.TIMESTAMP),
    /** "20:00-20:59" -> 20 (hora de inicio). */
    HOUR_RANGE(Target.SHORT, Target.INT),
    /** "18:00-23:59" -> NOCHE (MADRUGADA, MANANA, TARDE, NOCHE). */
    TIME_BAND_RANGE(Target.TEXT),
    /** "7.Sábado" -> SABADO. */
    WEEKDAY_LABEL(Target.TEXT),
    /** "D. Abril", "abril" o "4" -> 4. */
    MONTH_LABEL(Target.SHORT, Target.INT);

    private final Target[] destinos;

    FieldType(Target... destinos) {
        this.destinos = destinos;
    }

    public boolean compatibleCon(Target destino) {
        for (Target t : destinos) {
            if (t == destino) {
                return true;
            }
        }
        return false;
    }
}
