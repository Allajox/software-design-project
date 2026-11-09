package model.ingestion.profile;

import java.util.Map;
import java.util.Set;

/**
 * Regla de una columna del archivo.
 *
 * @param encabezado     nombre de la columna tal como aparece en el perfil (para mensajes)
 * @param clave          encabezado normalizado (TextNormalizer.clave), con el que se busca en la fila
 * @param campo          campo destino (ver FieldCatalog)
 * @param obligatorio    si falta o viene "desconocido", el registro queda INCOMPLETO
 * @param valores        para CHOICE: texto normalizado -> valor canónico
 * @param tokensVacios   textos normalizados que significan "sin dato" solo en esta columna (ej. "cantonal" en Kilómetro)
 * @param min            límite inferior opcional (más estricto que el del catálogo)
 * @param max            límite superior opcional
 * @param maxLongitud    longitud máxima opcional para texto
 * @param formato        patrón de fecha (DateTimeFormatter) para DATE
 */
public record ColumnRule(String encabezado, String clave, String campo, FieldType tipo, boolean obligatorio,
                         Map<String, String> valores, Set<String> tokensVacios,
                         Double min, Double max, Integer maxLongitud, String formato) {
}
