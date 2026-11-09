package model.ingestion;

import enums.FileFormat;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Valida el formato del archivo ANTES de procesar registros (criterio de aceptación de HU 1):
 * la extensión debe ser CSV, JSON o Excel (.xlsx) y el contenido debe corresponder a ella.
 */
public final class FileFormatDetector {

    private static final int MUESTRA = 8192;

    private FileFormatDetector() {
    }

    public static FileFormat detectar(UploadedFile archivo) throws IOException {
        FileFormat declarado = porExtension(archivo.name());
        byte[] muestra = leerMuestra(archivo);
        if (muestra.length == 0) {
            throw new IngestionException("El archivo está vacío.");
        }
        boolean esZip = muestra.length >= 4 && muestra[0] == 'P' && muestra[1] == 'K'
                && muestra[2] == 3 && muestra[3] == 4;

        switch (declarado) {
            case EXCEL -> {
                if (!esZip) {
                    throw new IngestionException("El contenido no corresponde a un libro de Excel (.xlsx).");
                }
            }
            case JSON -> {
                if (esZip || primerCaracterUtil(muestra) == -1
                        || (primerCaracterUtil(muestra) != '{' && primerCaracterUtil(muestra) != '[')) {
                    throw new IngestionException("El contenido no corresponde a un JSON (debe iniciar con '{' o '[').");
                }
            }
            case CSV -> {
                if (esZip || contieneBytesNulos(muestra)) {
                    throw new IngestionException("El contenido no corresponde a un archivo de texto CSV.");
                }
            }
        }
        return declarado;
    }

    static FileFormat porExtension(String nombre) {
        String n = nombre == null ? "" : nombre.toLowerCase(Locale.ROOT);
        if (n.endsWith(".csv")) {
            return FileFormat.CSV;
        }
        if (n.endsWith(".json") || n.endsWith(".geojson")) {
            return FileFormat.JSON;
        }
        if (n.endsWith(".xlsx")) {
            return FileFormat.EXCEL;
        }
        if (n.endsWith(".xls")) {
            throw new IngestionException("El formato Excel antiguo (.xls) no está soportado; guárdelo como .xlsx.");
        }
        throw new IngestionException("Formato de archivo no soportado. Se aceptan CSV, JSON y Excel (.xlsx).");
    }

    private static byte[] leerMuestra(UploadedFile archivo) throws IOException {
        try (InputStream in = archivo.open()) {
            return in.readNBytes(MUESTRA);
        }
    }

    /** Primer carácter distinto de espacio, ignorando el BOM UTF-8; -1 si no hay. */
    private static int primerCaracterUtil(byte[] b) {
        int i = 0;
        if (b.length >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) {
            i = 3;
        }
        for (; i < b.length; i++) {
            int c = b[i] & 0xFF;
            if (c != ' ' && c != '\t' && c != '\r' && c != '\n') {
                return c;
            }
        }
        return -1;
    }

    private static boolean contieneBytesNulos(byte[] b) {
        for (byte x : b) {
            if (x == 0) {
                return true;
            }
        }
        return false;
    }
}
