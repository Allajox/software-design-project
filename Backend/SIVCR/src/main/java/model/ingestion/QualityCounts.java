package model.ingestion;

/** Conteo por categoría de calidad de una carga. omitidos = filas que el filtro del perfil dejó fuera. */
public record QualityCounts(int validos, int incompletos, int corruptos, int omitidos) {

    public static final QualityCounts VACIO = new QualityCounts(0, 0, 0, 0);

    /** Filas que entraron a evaluación (sin las omitidas). */
    public int evaluados() {
        return validos + incompletos + corruptos;
    }
}
