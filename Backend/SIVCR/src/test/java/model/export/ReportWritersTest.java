package model.export;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.Climate;
import enums.Day;
import enums.Province;
import enums.QualityStatus;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import java.io.ByteArrayInputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import model.Sinister;
import model.dto.ExportFile;
import model.dto.KPIResult;
import model.dto.KPIValue;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

/** Los tres formatos de exportación: lo que escriben se vuelve a leer y se comprueba (sin Spring ni base de datos). */
class ReportWritersTest {

    private static final Charset WIN_ANSI = Charset.forName("windows-1252");
    private static final LocalDateTime GENERADO = LocalDateTime.of(2026, 11, 9, 20, 5, 30);

    private static Sinister siniestro(String canton, String distrito, String ruta, Double km, int anio) {
        return new Sinister(Province.SAN_JOSE, canton, distrito, ruta, km, null, null, null,
                Severity.CON_MUERTOS_O_GRAVES, Climate.LLUVIA_CON_NEBLINA, RoadStatus.CONSTRUCCION_O_REPARACION, null,
                QualityStatus.VALIDO, null, anio, 4, Day.MIERCOLES, TimeSlot.MANANA);
    }

    private static KPIResult kpis() {
        return new KPIResult(3, new KPIResult.Tsv(new KPIValue(12.5, "%", "Sin filtros"), 100, List.of(), List.of()),
                new KPIValue(3.0, "índice", "Sin filtros"),
                new KPIValue(null, "min", "Sin filtros · Sin datos: la fuente no registra tiempos de respuesta"),
                new KPIValue(25.0, "%", "Sin filtros"));
    }

    private static ReportData datos(List<Sinister> registros, KPIResult kpis) {
        return new ReportData("Provincia: San José · Año: 2023", GENERADO, kpis, registros);
    }

    private static List<Sinister> muchos(int cantidad) {
        List<Sinister> lista = new ArrayList<>();
        for (int i = 0; i < cantidad; i++) {
            lista.add(siniestro("Escazú", "San Antonio", "27", 12.5, 2023));
        }
        return lista;
    }

    // ---- CSV ----

    @Test
    void elCsvLlevaBomUtf8EncabezadoYUnaFilaPorRegistro() {
        ExportFile archivo = new CsvReportWriter().escribir(datos(List.of(
                siniestro("Pérez Zeledón", "San Isidro", "2", 12.0, 2023),
                siniestro("Escazú", "San Antonio", "Cantonal", null, 2024)), null));

        byte[] b = archivo.content();
        assertEquals((byte) 0xEF, b[0]);
        assertEquals((byte) 0xBB, b[1]);
        assertEquals((byte) 0xBF, b[2]);
        assertEquals("siniestros-2026-11-09.csv", archivo.fileName());
        assertTrue(archivo.mimeType().startsWith("text/csv"));

        String texto = new String(b, 3, b.length - 3, StandardCharsets.UTF_8);
        String[] lineas = texto.split("\r\n");
        assertEquals(3, lineas.length);
        assertTrue(lineas[0].startsWith("Año;Mes;Día;Franja;Provincia;Cantón;Distrito;Ruta;Km;Severidad;Clima;Calzada"),
                lineas[0]);
        // tildes intactas, enums en español, 12.0 sin ceros y un valor ausente queda vacío
        assertTrue(lineas[1].startsWith("2023;4;Miércoles;Mañana;San José;Pérez Zeledón;San Isidro;2;12;"
                + "Con muertos o graves;Lluvia con neblina;Construcción o reparación;"), lineas[1]);
        assertTrue(lineas[2].startsWith("2024;4;Miércoles;Mañana;San José;Escazú;San Antonio;Cantonal;;"), lineas[2]);
    }

    @Test
    void elCsvEntrecomillaLosPuntoYComaYNeutralizaLasFormulas() {
        ExportFile archivo = new CsvReportWriter().escribir(datos(List.of(
                siniestro("A;B", "=HYPERLINK(\"http://x\")", "2", 1.0, 2023),
                siniestro("+cmd", "@SUM(A1)", "2", 1.0, 2023)), null));
        String texto = new String(archivo.content(), 3, archivo.content().length - 3, StandardCharsets.UTF_8);
        String[] lineas = texto.split("\r\n");
        assertTrue(lineas[1].contains("\"A;B\""), lineas[1]);
        assertTrue(lineas[1].contains("'=HYPERLINK"), lineas[1]);
        assertTrue(lineas[2].contains("'+cmd"), lineas[2]);
        assertTrue(lineas[2].contains("'@SUM"), lineas[2]);
    }

    @Test
    void elCsvSinRegistrosTraeSoloElEncabezado() {
        ExportFile archivo = new CsvReportWriter().escribir(datos(List.of(), null));
        String texto = new String(archivo.content(), 3, archivo.content().length - 3, StandardCharsets.UTF_8);
        assertEquals(1, texto.split("\r\n").length);
    }

    // ---- Excel ----

    @Test
    void elExcelTraeDosHojasResumenYRegistros() throws Exception {
        ExportFile archivo = new ExcelReportWriter().escribir(datos(List.of(
                siniestro("Pérez Zeledón", "San Isidro", "2", 12.5, 2023),
                siniestro("Escazú", "=1+1", "Cantonal", null, 2024)), kpis()));

        assertEquals("siniestros-2026-11-09.xlsx", archivo.fileName());
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", archivo.mimeType());
        try (XSSFWorkbook libro = new XSSFWorkbook(new ByteArrayInputStream(archivo.content()))) {
            assertEquals("Resumen", libro.getSheetName(0));
            assertEquals("Registros", libro.getSheetName(1));

            Sheet registros = libro.getSheet("Registros");
            assertEquals(2, registros.getLastRowNum()); // encabezado + 2 registros
            assertEquals("Año", registros.getRow(0).getCell(0).getStringCellValue());
            assertEquals(2023.0, registros.getRow(1).getCell(0).getNumericCellValue()); // número, no texto
            assertEquals("Pérez Zeledón", registros.getRow(1).getCell(5).getStringCellValue());
            assertEquals(12.5, registros.getRow(1).getCell(8).getNumericCellValue());
            assertNull(registros.getRow(2).getCell(8)); // km ausente: celda vacía
            // una fórmula del texto queda como texto, no se evalúa
            assertEquals("=1+1", registros.getRow(2).getCell(6).getStringCellValue());
            assertEquals(org.apache.poi.ss.usermodel.CellType.STRING, registros.getRow(2).getCell(6).getCellType());

            Sheet resumen = libro.getSheet("Resumen");
            assertEquals("Provincia: San José · Año: 2023", resumen.getRow(1).getCell(1).getStringCellValue());
            assertEquals("09/11/2026 20:05", resumen.getRow(2).getCell(1).getStringCellValue());
            // indicadores: el TPR sin datos dice "Sin datos" y no un cero
            assertEquals("Tasa de siniestralidad vial (TSV)", resumen.getRow(7).getCell(0).getStringCellValue());
            assertEquals(12.5, resumen.getRow(7).getCell(1).getNumericCellValue());
            assertEquals("Tiempo promedio de respuesta (TPR)", resumen.getRow(9).getCell(0).getStringCellValue());
            assertEquals("Sin datos", resumen.getRow(9).getCell(1).getStringCellValue());
        }
    }

    @Test
    void elExcelAguantaMuchosRegistrosYSinRegistrosSoloTraeElEncabezado() throws Exception {
        try (XSSFWorkbook libro = new XSSFWorkbook(new ByteArrayInputStream(
                new ExcelReportWriter().escribir(datos(muchos(3000), kpis())).content()))) {
            assertEquals(3000, libro.getSheet("Registros").getLastRowNum());
        }
        try (XSSFWorkbook libro = new XSSFWorkbook(new ByteArrayInputStream(
                new ExcelReportWriter().escribir(datos(List.of(), kpis())).content()))) {
            assertEquals(0, libro.getSheet("Registros").getLastRowNum());
        }
    }

    // ---- PDF ----

    @Test
    void elPdfEsUnArchivoBienFormadoConSusDesplazamientosCorrectos() {
        ExportFile archivo = new PdfReportWriter().escribir(datos(muchos(200), kpis()));
        assertEquals("application/pdf", archivo.mimeType());
        assertEquals("siniestros-2026-11-09.pdf", archivo.fileName());

        String pdf = new String(archivo.content(), WIN_ANSI);
        assertTrue(pdf.startsWith("%PDF-1.4"));
        assertTrue(pdf.endsWith("%%EOF\n"));

        // la tabla xref apunta a donde de verdad empieza cada objeto
        int inicioXref = pdf.lastIndexOf("startxref");
        int posXref = Integer.parseInt(pdf.substring(inicioXref + "startxref\n".length(), pdf.indexOf('\n',
                inicioXref + "startxref\n".length())));
        assertTrue(pdf.startsWith("xref\n", posXref));
        String[] lineas = pdf.substring(posXref).split("\n");
        int objetos = Integer.parseInt(lineas[1].split(" ")[1]) - 1;
        for (int i = 1; i <= objetos; i++) {
            int pos = Integer.parseInt(lineas[2 + i].substring(0, 10));
            assertTrue(pdf.startsWith(i + " 0 obj\n", pos), "objeto " + i + " no está en " + pos);
        }

        // el /Length de cada contenido es exacto
        Matcher m = Pattern.compile("<< /Length (\\d+) >>\nstream\n").matcher(pdf);
        int flujos = 0;
        while (m.find()) {
            int largo = Integer.parseInt(m.group(1));
            assertEquals("\nendstream", pdf.substring(m.end() + largo, m.end() + largo + "\nendstream".length()));
            flujos++;
        }
        int paginas = countMatches(pdf, "/Type /Page ");
        assertTrue(paginas >= 4, "200 registros caben en más de 3 hojas: " + paginas);
        assertEquals(paginas, flujos);
        assertTrue(pdf.contains("(Página 1 de " + paginas + ")"));
        assertTrue(pdf.contains("(Página " + paginas + " de " + paginas + ")"));
    }

    @Test
    void elPdfLlevaElAmbitoLosKpiYLasTildesBienCodificadas() {
        String pdf = new String(new PdfReportWriter().escribir(datos(List.of(
                siniestro("Pérez Zeledón", "San Isidro", "2", 12.5, 2023)), kpis())).content(), WIN_ANSI);
        assertTrue(pdf.contains("Ámbito: Provincia: San José · Año: 2023"), "ámbito");
        assertTrue(pdf.contains("TSV: 12,50 %"), "TSV con coma decimal");
        assertTrue(pdf.contains("TPR: sin datos"), "TPR sin datos");
        assertTrue(pdf.contains("Pérez Zeledón"), "tilde y eñe");
        assertTrue(pdf.contains("Construcción o reparación"));
        assertTrue(pdf.contains("Generado: 09/11/2026 20:05"));
    }

    @Test
    void elPdfEscapaLosParentesisYLaBarraInversaDelTexto() {
        String pdf = new String(new PdfReportWriter().escribir(datos(List.of(
                siniestro("Cantón (norte)", "A\\B", "2", 1.0, 2023)), null)).content(), WIN_ANSI);
        assertTrue(pdf.contains("Cantón \\(norte\\)"), "paréntesis escapados");
        assertTrue(pdf.contains("A\\\\B"), "barra escapada");
    }

    @Test
    void elPdfSeLimitaAlMaximoDeFilasYLoDice() {
        String pdf = new String(new PdfReportWriter().escribir(datos(muchos(PdfReportWriter.MAX_FILAS + 100), null))
                .content(), WIN_ANSI);
        assertTrue(pdf.contains("Registros en la tabla: " + PdfReportWriter.MAX_FILAS + " de "
                + (PdfReportWriter.MAX_FILAS + 100)), "debe avisar el recorte");
    }

    @Test
    void elPdfSinRegistrosLoDiceEnVezDeQuedarVacio() {
        String pdf = new String(new PdfReportWriter().escribir(datos(List.of(), kpis())).content(), WIN_ANSI);
        assertTrue(pdf.contains("No hay registros que cumplan los filtros."));
        assertEquals(1, countMatches(pdf, "/Type /Page "));
    }

    @Test
    void ajustarCortaYRellenaAlAnchoExacto() {
        assertEquals("abc   ", PdfReportWriter.ajustar("abc", 6));
        assertEquals("abcd…", PdfReportWriter.ajustar("abcdefgh", 5));
        assertEquals("   ", PdfReportWriter.ajustar(null, 3));
        assertFalse(PdfReportWriter.ajustar("a\nb", 5).contains("\n"));
    }

    @Test
    void envolverNoPasaDelMaximoYNoPierdePalabras() {
        List<String> lineas = PdfReportWriter.envolver("uno dos tres cuatro cinco seis siete", 12);
        for (String linea : lineas) {
            assertTrue(linea.length() <= 12, linea);
        }
        assertEquals("uno dos tres cuatro cinco seis siete", String.join(" ", lineas));
        assertNotNull(PdfReportWriter.envolver("", 10));
    }

    private static int countMatches(String texto, String patron) {
        int cuenta = 0;
        for (int i = texto.indexOf(patron); i >= 0; i = texto.indexOf(patron, i + patron.length())) {
            cuenta++;
        }
        return cuenta;
    }
}
