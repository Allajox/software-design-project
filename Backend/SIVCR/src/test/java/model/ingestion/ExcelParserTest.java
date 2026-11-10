package model.ingestion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import model.ingestion.parser.ExcelParser;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

/** Datos 100% sintéticos (ver TestSupport). */
class ExcelParserTest {

    private final ExcelParser parser = new ExcelParser();
    private static final ParseOptions SIN_HOJA = new ParseOptions(null, StandardCharsets.ISO_8859_1, ',', null, null);

    /** Escribe una fila: String -> celda de texto, Number -> celda numérica, null -> celda vacía. */
    private static void fila(Sheet hoja, int indice, Object... valores) {
        Row fila = hoja.createRow(indice);
        for (int i = 0; i < valores.length; i++) {
            Object v = valores[i];
            if (v instanceof String s) {
                fila.createCell(i).setCellValue(s);
            } else if (v instanceof Number n) {
                fila.createCell(i).setCellValue(n.doubleValue());
            }
        }
    }

    private static byte[] libro() throws IOException {
        try (XSSFWorkbook libro = new XSSFWorkbook(); ByteArrayOutputStream salida = new ByteArrayOutputStream()) {
            Sheet primera = libro.createSheet("Hoja1");
            fila(primera, 0, "Año", "Cantón", "Edad");
            fila(primera, 1, 2024, "Pérez Zeledón", 28);
            // la fila 2 (índice) queda vacía a propósito
            fila(primera, 3, 2023, "Heredia", null, "sobrante");
            Sheet segunda = libro.createSheet("Datos");
            fila(segunda, 0, "Columna");
            fila(segunda, 1, "valor de la segunda hoja");
            libro.write(salida);
            return salida.toByteArray();
        }
    }

    @Test
    void leeLaPrimeraHojaConNumerosSinDecimalesYSaltaFilasVacias() throws IOException {
        List<SinisterBruteData> filas = parser.parse(UploadedFile.of("datos.xlsx", libro()), SIN_HOJA);

        assertEquals(2, filas.size());
        SinisterBruteData a = filas.get(0);
        assertEquals(2, a.fila());
        assertEquals("2024", a.valor("ano"));              // numérico 2024.0 se lee como "2024"
        assertEquals("Pérez Zeledón", a.valor("canton"));
        assertEquals("28", a.valor("edad"));
        assertFalse(a.malformada());

        SinisterBruteData b = filas.get(1);
        assertEquals(4, b.fila());                         // la fila vacía no se reporta, pero cuenta en la numeración
        assertEquals("", b.valor("edad"));
        assertTrue(b.malformada());                        // trae una celda más que el encabezado
    }

    @Test
    void leeLaHojaIndicadaPorElPerfil() throws IOException {
        ParseOptions segundaHoja = new ParseOptions(null, StandardCharsets.ISO_8859_1, ',', null, "datos");
        List<SinisterBruteData> filas = parser.parse(UploadedFile.of("datos.xlsx", libro()), segundaHoja);
        assertEquals(1, filas.size());
        assertEquals("valor de la segunda hoja", filas.get(0).valor("columna"));
    }

    @Test
    void unaHojaInexistenteFallaConMensaje() throws IOException {
        byte[] contenido = libro();
        ParseOptions inexistente = new ParseOptions(null, StandardCharsets.ISO_8859_1, ',', null, "NoExiste");
        IngestionException e = assertThrows(IngestionException.class,
                () -> parser.parse(UploadedFile.of("datos.xlsx", contenido), inexistente));
        assertTrue(e.getMessage().contains("NoExiste"));
    }

    @Test
    void leerEncabezadosDevuelveLaPrimeraFila() throws IOException {
        assertEquals(List.of("Año", "Cantón", "Edad"),
                parser.leerEncabezados(UploadedFile.of("datos.xlsx", libro()), SIN_HOJA));
    }

    @Test
    void unArchivoQueNoEsExcelSeRechazaConMensaje() {
        byte[] noEsExcel = "esto no es un libro".getBytes(StandardCharsets.UTF_8);
        assertThrows(IngestionException.class, () -> parser.parse(UploadedFile.of("falso.xlsx", noEsExcel), SIN_HOJA));
    }

    @Test
    void unLibroSinFilasSeRechaza() throws IOException {
        try (XSSFWorkbook libro = new XSSFWorkbook(); ByteArrayOutputStream salida = new ByteArrayOutputStream()) {
            libro.createSheet("Vacia");
            libro.write(salida);
            byte[] contenido = salida.toByteArray();
            assertThrows(IngestionException.class, () -> parser.parse(UploadedFile.of("vacio.xlsx", contenido), SIN_HOJA));
        }
    }
}
