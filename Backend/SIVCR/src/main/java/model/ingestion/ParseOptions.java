package model.ingestion;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Opciones de lectura que cada perfil de mapeo le pasa al parser.
 *
 * @param charset          codificación del CSV; null = detectar (UTF-8 si es válido, si no fallbackCharset)
 * @param fallbackCharset  codificación a usar cuando el archivo no es UTF-8 válido
 * @param delimiter        separador del CSV
 * @param jsonRecordsPath  ruta (separada por puntos) al arreglo de registros en un JSON; null/vacío = la raíz es el arreglo
 * @param sheetName        hoja de Excel a leer; null/vacío = la primera
 */
public record ParseOptions(Charset charset, Charset fallbackCharset, char delimiter,
                           String jsonRecordsPath, String sheetName) {

    public static ParseOptions porDefecto() {
        return new ParseOptions(null, StandardCharsets.ISO_8859_1, ',', null, null);
    }
}
