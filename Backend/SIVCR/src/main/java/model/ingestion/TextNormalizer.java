package model.ingestion;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** Normalización de textos para comparar encabezados y valores sin depender de tildes, mayúsculas ni espacios. */
public final class TextNormalizer {

    private static final Pattern MARCAS_DIACRITICAS = Pattern.compile("\\p{M}+");
    private static final Pattern ESPACIOS = Pattern.compile("\\s+");

    private TextNormalizer() {
    }

    /**
     * Limpia un texto conservando mayúsculas y tildes: quita BOM, convierte espacios
     * no separables en normales, recorta y colapsa espacios repetidos.
     */
    public static String limpiar(String texto) {
        if (texto == null) {
            return "";
        }
        String t = texto.replace("\uFEFF", "").replace('\u00A0', ' ');
        return ESPACIOS.matcher(t).replaceAll(" ").trim();
    }

    /**
     * Clave de comparación: limpio, sin tildes y en minúsculas.
     * "Cantón " y "canton" producen la misma clave; "Vehiculo en  el que" colapsa el doble espacio.
     */
    public static String clave(String texto) {
        String t = Normalizer.normalize(limpiar(texto), Normalizer.Form.NFD);
        t = MARCAS_DIACRITICAS.matcher(t).replaceAll("");
        return t.toLowerCase(Locale.ROOT);
    }
}
