package model;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Claves de comparación del panel del dashboard: el frontend manda y muestra etiquetas ("San José", "Mañana", "Ruta 27")
 * y la base guarda valores normalizados (SAN_JOSE, MANANA, 27). Normalizar es quitar tildes, pasar a mayúsculas y cambiar
 * los espacios por "_"; así las dos formas se comparan sin depender de cómo se escribió cada una.
 */
public final class Claves {

    private Claves() { }

    /** "San José" -> "SAN_JOSE"; null -> "". */
    public static String norm(String texto) {
        if (texto == null) {
            return "";
        }
        String sinTildes = Normalizer.normalize(texto.trim(), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return sinTildes.toUpperCase(Locale.ROOT).replaceAll("\\s+", "_");
    }

    /**
     * Valor guardado en sinister.severidad para una etiqueta del frontend o para el propio valor guardado. COSEVI solo
     * distingue "con muertos o graves" de "solo heridos leves".
     */
    public static String severidad(String crudo) {
        String k = norm(crudo);
        if (k.startsWith("FALLEC")) {
            return "FALLECIDO";
        }
        if (k.equals("GRAVE") || k.equals("CON_MUERTOS_O_GRAVES")) {
            return "CON_MUERTOS_O_GRAVES";
        }
        if (k.equals("LEVE") || k.equals("SOLO_HERIDOS_LEVES")) {
            return "SOLO_HERIDOS_LEVES";
        }
        return k;
    }
}
