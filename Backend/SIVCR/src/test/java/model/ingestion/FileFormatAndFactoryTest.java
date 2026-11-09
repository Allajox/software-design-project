package model.ingestion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.FileFormat;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import model.ingestion.parser.CsvParser;
import model.ingestion.parser.ExcelParser;
import model.ingestion.parser.FileParserFactory;
import model.ingestion.parser.JsonParser;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

/** Datos 100% sintéticos (ver TestSupport). */
class FileFormatAndFactoryTest {

    private static UploadedFile archivo(String nombre, String contenido) {
        return UploadedFile.of(nombre, contenido.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] xlsx() throws IOException {
        try (XSSFWorkbook libro = new XSSFWorkbook(); ByteArrayOutputStream salida = new ByteArrayOutputStream()) {
            libro.createSheet("Hoja1").createRow(0).createCell(0).setCellValue("x");
            libro.write(salida);
            return salida.toByteArray();
        }
    }

    // ---- FileFormatDetector ----

    @Test
    void reconoceLosTresFormatosAceptados() throws IOException {
        assertEquals(FileFormat.CSV, FileFormatDetector.detectar(archivo("datos.CSV", "a;b\n1;2\n")));
        assertEquals(FileFormat.JSON, FileFormatDetector.detectar(archivo("datos.json", "[{\"a\":1}]")));
        assertEquals(FileFormat.JSON, FileFormatDetector.detectar(archivo("capa.geojson", "{\"type\":\"FeatureCollection\"}")));
        assertEquals(FileFormat.EXCEL, FileFormatDetector.detectar(UploadedFile.of("datos.xlsx", xlsx())));
    }

    @Test
    void aceptaJsonConBomYEspaciosIniciales() throws IOException {
        byte[] contenido = ("\uFEFF  \n  [1]").getBytes(StandardCharsets.UTF_8);
        assertEquals(FileFormat.JSON, FileFormatDetector.detectar(UploadedFile.of("bom.json", contenido)));
    }

    @Test
    void rechazaExtensionesNoSoportadasConUnMensajeClaro() {
        IngestionException pdf = assertThrows(IngestionException.class,
                () -> FileFormatDetector.detectar(archivo("reporte.pdf", "%PDF-1.4")));
        assertTrue(pdf.getMessage().contains("CSV, JSON y Excel"));

        IngestionException xls = assertThrows(IngestionException.class,
                () -> FileFormatDetector.detectar(archivo("viejo.xls", "contenido")));
        assertTrue(xls.getMessage().contains(".xlsx"));

        assertThrows(IngestionException.class, () -> FileFormatDetector.detectar(archivo("sin-extension", "a,b")));
    }

    @Test
    void rechazaArchivosVacios() {
        assertThrows(IngestionException.class, () -> FileFormatDetector.detectar(archivo("vacio.csv", "")));
    }

    @Test
    void rechazaContenidoQueNoCorrespondeALaExtension() throws IOException {
        // un .xlsx que en realidad es texto
        assertThrows(IngestionException.class, () -> FileFormatDetector.detectar(archivo("falso.xlsx", "a;b")));
        // un .csv que en realidad es un libro de Excel (zip)
        byte[] libro = xlsx();
        assertThrows(IngestionException.class, () -> FileFormatDetector.detectar(UploadedFile.of("falso.csv", libro)));
        // un .json que no empieza como JSON
        assertThrows(IngestionException.class, () -> FileFormatDetector.detectar(archivo("falso.json", "a;b\n1;2")));
        // un .csv binario
        assertThrows(IngestionException.class,
                () -> FileFormatDetector.detectar(UploadedFile.of("bin.csv", new byte[] {'a', 0, 'b', 0, 1, 2})));
    }

    // ---- FileParserFactory (patrón Factory) ----

    @Test
    void laFabricaCreaElParserDeCadaFormato() {
        FileParserFactory fabrica = new FileParserFactory();
        assertInstanceOf(CsvParser.class, fabrica.crear(FileFormat.CSV));
        assertInstanceOf(JsonParser.class, fabrica.crear(FileFormat.JSON));
        assertInstanceOf(ExcelParser.class, fabrica.crear(FileFormat.EXCEL));
        for (FileFormat f : FileFormat.values()) {
            assertEquals(f, fabrica.crear(f).formato());
        }
    }

    @Test
    void laFabricaRechazaUnFormatoNulo() {
        assertThrows(IllegalArgumentException.class, () -> new FileParserFactory().crear(null));
    }
}
