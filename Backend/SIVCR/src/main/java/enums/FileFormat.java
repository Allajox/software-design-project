package enums;

/**
 * Formatos de archivo aceptados por la ingesta (HU 1).
 *
 * El GeoJSON del MOPT (SNIT/WFS) se trata como JSON: lo lee JsonParser con
 * una ruta de registros (por ejemplo "features"), por eso no hay un valor propio.
 */
public enum FileFormat {
    CSV,
    JSON,
    EXCEL
}
