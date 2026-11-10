package model.ingestion.profile;

import enums.DataSource;
import enums.FileFormat;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import model.ingestion.ParseOptions;
import model.ingestion.TextNormalizer;

/**
 * Perfil de mapeo de columnas y reglas de calidad de una fuente (HU 4). Se carga desde un YAML por perfil
 * (resources/ingestion/profiles), no está en el código: las columnas reales se confirman al abrir los archivos.
 * Una fuente puede tener varios perfiles (COSEVI: siniestros y personas); se elige el que coincide con
 * los encabezados del archivo.
 *
 * @param habilitado             false = la fuente se reconoce pero todavía no se puede cargar (ver motivoDeshabilitado)
 * @param verificacion           POR_VERIFICAR si el mapeo se dedujo de documentación y no de un archivo real
 * @param encabezadosRequeridos  columnas que identifican el perfil y deben existir en el archivo
 * @param valoresDesconocidos    textos normalizados que significan "sin dato" en cualquier columna
 * @param constantes             campos que se fijan siempre (ej. INEC: severidad = FALLECIDO)
 */
public record MappingProfile(String id, DataSource fuente, RecordKind tipo, String descripcion,
                             boolean habilitado, String motivoDeshabilitado, Verificacion verificacion,
                             Set<FileFormat> formatos, Charset charset, Charset charsetRespaldo,
                             char delimitador, String rutaRegistrosJson, String hoja,
                             List<String> encabezadosRequeridos, Set<String> valoresDesconocidos,
                             List<ColumnRule> columnas, Map<String, String> constantes,
                             List<RowFilter> filtros) {

    public enum Verificacion { VERIFICADO, POR_VERIFICAR }

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

    /**
     * Filtro previo: solo las filas cuya columna cumple el patrón se procesan; las demás se cuentan como
     * "omitidas" y no afectan los contadores de calidad (ej. INEC: causa de muerte CIE-10 V01-V89).
     */
    public record RowFilter(String encabezado, String clave, Pattern patron) {

        public boolean acepta(String valor) {
            return patron.matcher(TextNormalizer.limpiar(valor)).find();
        }
    }

    public ParseOptions opcionesDeLectura() {
        return new ParseOptions(charset, charsetRespaldo, delimitador, rutaRegistrosJson, hoja);
    }

    /** Nombres (tal como los escribe el perfil) de las columnas requeridas que el archivo no trae. */
    public List<String> encabezadosFaltantes(Collection<String> encabezadosDelArchivo) {
        Set<String> presentes = new HashSet<>();
        for (String e : encabezadosDelArchivo) {
            presentes.add(TextNormalizer.clave(e));
        }
        List<String> faltantes = new ArrayList<>();
        for (String requerido : encabezadosRequeridos) {
            if (!presentes.contains(TextNormalizer.clave(requerido))) {
                faltantes.add(requerido);
            }
        }
        return faltantes;
    }

    public boolean coincideCon(Collection<String> encabezadosDelArchivo) {
        return encabezadosFaltantes(encabezadosDelArchivo).isEmpty();
    }
}
