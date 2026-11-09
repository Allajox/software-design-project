package model.ingestion;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fila cruda tal como sale del archivo, sin interpretar.
 *
 * @param fila       número de fila como se vería en una hoja de cálculo (el encabezado es la fila 1)
 * @param valores    columna -> texto; las claves son los encabezados normalizados (TextNormalizer.clave)
 * @param malformada true si la fila no tiene la misma cantidad de columnas que el encabezado
 */
public record SinisterBruteData(int fila, Map<String, String> valores, boolean malformada) {

    public SinisterBruteData {
        valores = Collections.unmodifiableMap(new LinkedHashMap<>(valores));
    }

    /** Valor de la columna (por clave normalizada) o "" si no existe. */
    public String valor(String claveEncabezado) {
        String v = valores.get(claveEncabezado);
        return v == null ? "" : v;
    }
}
