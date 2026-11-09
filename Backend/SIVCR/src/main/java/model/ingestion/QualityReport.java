package model.ingestion;

import java.util.List;

/**
 * Reporte de calidad de una carga (HU 3).
 *
 * @param errores primeros errores (fila y motivo, sin contenido de las celdas); el máximo es configurable.
 *                Los contadores son exactos aunque la lista esté recortada.
 */
public record QualityReport(Long idCarga, int validos, int incompletos, int corruptos, int omitidos,
                            List<String> errores) {

    public QualityReport {
        errores = errores == null ? List.of() : List.copyOf(errores);
    }

    /** true si hay más filas con problemas que errores listados. */
    public boolean erroresRecortados() {
        return errores.size() < incompletos + corruptos;
    }
}
