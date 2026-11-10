package model.ingestion.profile;

import java.util.regex.Pattern;
import model.ingestion.TextNormalizer;

/**
 * Filtro previo: solo las filas cuya columna cumple el patrón se procesan; las demás se cuentan como
 * "omitidas" y no afectan los contadores de calidad (ej. INEC: causa de muerte CIE-10 V01-V89).
 */
public record RowFilter(String encabezado, String clave, Pattern patron) {

    public boolean acepta(String valor) {
        return patron.matcher(TextNormalizer.limpiar(valor)).find();
    }
}
