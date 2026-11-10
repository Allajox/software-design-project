package model.managers;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfTemplate;
import com.lowagie.text.pdf.PdfWriter;
import enums.ExportFormat;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import model.SivcrException;
import model.dto.DashboardFilters;
import model.dto.DashboardPanel;
import model.dto.ExportFile;
import model.interfaces.IDashboardManager;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;


/**
 * Reporte del dashboard (RF-2) en CSV, Excel o PDF: los filtros aplicados, los KPI y cada gráfico como tabla, con el mapa
 * de calor coloreado y el Pareto dibujado en el PDF. Es aparte de ReportManager (HU 21), que exporta la tabla de
 * registros. No depende de Spring.
 */
public class DashboardReportManager {

    /** Una tabla del reporte: título, encabezados y filas (los números se conservan como números) */
    private enum Tipo { TABLA, MAPA_CALOR, PARETO }

    private record Seccion(String titulo, List<String> columnas, List<List<Object>> filas, Tipo tipo) {
        Seccion(String titulo, List<String> columnas, List<List<Object>> filas) {
            this(titulo, columnas, filas, Tipo.TABLA);
        }
    }

    private static final Locale CR = Locale.of("es", "CR");

    private final IDashboardManager panel;
    private final Clock reloj;

    public DashboardReportManager(IDashboardManager panel, Clock reloj) {
        this.panel = panel;
        this.reloj = reloj;
    }

    public ExportFile export(DashboardFilters filtros, ExportFormat formato) {
        if (formato == null) {
            throw new SivcrException(SivcrException.Tipo.SOLICITUD_INVALIDA,
                    "Formato de exportación no válido. Use CSV, EXCEL o PDF.");
        }
        List<Seccion> secciones = secciones(filtros, panel.getPanel(filtros));
        LocalDateTime generado = LocalDateTime.now(reloj);
        return switch (formato) {
            case CSV -> archivo(csv(secciones), "csv", "text/csv;charset=UTF-8", generado);
            case EXCEL -> archivo(xlsx(secciones), "xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", generado);
            case PDF -> archivo(pdf(secciones, generado), "pdf", "application/pdf", generado);
        };
    }

    private static ExportFile archivo(byte[] contenido, String extension, String mime, LocalDateTime generado) {
        return new ExportFile(contenido, mime, "sivcr-dashboard-" + generado.toLocalDate() + "." + extension);
    }

    // =====================================================================
    // Contenido
    // =====================================================================

    private List<Seccion> secciones(DashboardFilters f, DashboardPanel d) {
        List<Seccion> s = new ArrayList<>();

        s.add(filtrosAplicados(f));

        var k = d.kpis();
        s.add(new Seccion("Indicadores clave", List.of("Indicador", "Valor"), List.of(
                fila("Siniestros (con filtros)", k.siniestros()),
                fila("Siniestros (total registrado)", k.totalRegistros()),
                fila("TSV - Tasa de siniestralidad vial (%)", k.tsv()),
                fila("ISS - Índice de severidad", k.iss()),
                fila("TPR - Tiempo promedio de respuesta (min)", k.tpr() == null ? "Sin datos" : k.tpr()),
                fila("Personas afectadas", k.victimas()),
                fila("Fallecidos", k.fallecidos()),
                fila("Heridos graves", k.heridosGraves()),
                fila("Heridos leves", k.heridosLeves()),
                fila("IC - Impacto por clima y calzada (%)", k.ic()))));

        s.add(new Seccion("Siniestros por provincia", List.of("Provincia", "Siniestros", "TSV (%)"),
                d.porProvincia().stream().map(i -> fila(i.etiqueta(), i.valor(), i.porcentaje())).toList()));

        s.add(new Seccion("Personas por tipo de vehículo", List.of("Vehículo", "Personas", "% del total", "TFv (%)"),
                d.porVehiculo().stream().map(i -> fila(i.etiqueta(), i.valor(), i.porcentaje(), i.tasaFatalidad())).toList()));

        s.add(new Seccion("Siniestros por gravedad", List.of("Gravedad", "Siniestros", "%"),
                d.porSeveridad().stream().map(i -> fila(i.etiqueta(), i.valor(), i.porcentaje())).toList()));

        s.add(new Seccion("Diagrama de Pareto: rutas con más siniestros", List.of("Ruta", "Siniestros", "%", "% acumulado"),
                d.rutasPrincipales().stream().map(i -> fila(i.etiqueta(), i.valor(), i.porcentaje(), i.acumulado())).toList(),
                Tipo.PARETO));

        var m = d.matrizDiaFranja();
        List<String> colsMatriz = new ArrayList<>();
        colsMatriz.add("Día");
        colsMatriz.addAll(m.franjas());
        List<List<Object>> filasMatriz = new ArrayList<>();
        for (int i = 0; i < m.dias().size(); i++) {
            List<Object> fila = new ArrayList<>();
            fila.add(m.dias().get(i));
            fila.addAll(m.valores().get(i));
            filasMatriz.add(fila);
        }
        s.add(new Seccion("Mapa de calor: día de la semana y franja horaria", colsMatriz, filasMatriz, Tipo.MAPA_CALOR));

        var p = d.perfilDemografico();
        List<List<Object>> filasPiramide = new ArrayList<>();
        for (int i = 0; i < p.edades().size(); i++) {
            filasPiramide.add(fila(p.edades().get(i), p.masculino().get(i), p.femenino().get(i)));
        }
        s.add(new Seccion("Personas por rango de edad y género", List.of("Rango de edad", "Masculino", "Femenino"), filasPiramide));

        return s;
    }

    /** Resumen de los filtros activos, para que el reporte diga con qué criterios se generó */
    private Seccion filtrosAplicados(DashboardFilters f) {
        List<List<Object>> filas = new ArrayList<>();
        texto(filas, "Provincia", f.provincia());
        texto(filas, "Cantón", f.canton());
        texto(filas, "Distrito", f.distrito());
        texto(filas, "Ruta", f.ruta());
        lista(filas, "Año", f.anios());
        lista(filas, "Mes", f.meses());
        lista(filas, "Día de la semana", f.dias());
        lista(filas, "Franja horaria", f.franjas());
        lista(filas, "Vehículo", f.vehiculos());
        lista(filas, "Gravedad", f.severidades());
        lista(filas, "Clima", f.climas());
        lista(filas, "Calzada", f.calzadas());
        lista(filas, "Rango de edad", f.edades());
        lista(filas, "Género", f.generos());
        if (filas.isEmpty()) filas.add(fila("Sin filtros", "Todos los registros válidos"));

        filas.add(fila("Nota (siniestros)",
                "Gravedad, rutas, día y franja se filtran por ubicación, fecha, gravedad, clima y calzada."));
        filas.add(fila("Nota (personas)",
                "Vehículo, edad y género se filtran por ubicación, fecha, vehículo, edad y género."));
        return new Seccion("Filtros aplicados", List.of("Filtro", "Valor"), filas);
    }

    private static void texto(List<List<Object>> filas, String nombre, String valor) {
        if (valor != null && !valor.isBlank()) filas.add(fila(nombre, valor));
    }

    private static void lista(List<List<Object>> filas, String nombre, List<?> valores) {
        if (!valores.isEmpty()) filas.add(fila(nombre, String.join(", ", valores.stream().map(String::valueOf).toList())));
    }

    private static List<Object> fila(Object... celdas) {
        return Arrays.asList(celdas);
    }

    /** Números con coma decimal (es-CR); enteros sin separador de miles */
    private static String comoTexto(Object o) {
        if (o instanceof Double || o instanceof Float) return String.format(CR, "%.2f", ((Number) o).doubleValue());
        return String.valueOf(o);
    }

    // =====================================================================
    // Colores del mapa de calor (un solo azul, de claro a oscuro)
    // =====================================================================

    private static final Color SIN_DATOS = new Color(0xF2, 0xF2, 0xF2);

    /** t entre 0 y 1; valores en cero usan un gris neutro (t < 0) */
    private static Color calor(double t) {
        if (t < 0) return SIN_DATOS;
        int r = (int) Math.round(0xEA + (0x08 - 0xEA) * t);
        int g = (int) Math.round(0xF1 + (0x30 - 0xF1) * t);
        int b = (int) Math.round(0xFB + (0x6B - 0xFB) * t);
        return new Color(r, g, b);
    }

    private static double maximoMatriz(Seccion s) {
        double max = 0;
        for (List<Object> fila : s.filas())
            for (int i = 1; i < fila.size(); i++)
                if (fila.get(i) instanceof Number n) max = Math.max(max, n.doubleValue());
        return max;
    }

    private static double intensidad(Object valor, double max) {
        double v = valor instanceof Number n ? n.doubleValue() : 0;
        return v <= 0 || max <= 0 ? -1 : v / max;
    }

    // =====================================================================
    // CSV (separador ';' y BOM: Excel en español lo abre bien con doble clic)
    // =====================================================================

    private byte[] csv(List<Seccion> secciones) {
        StringBuilder sb = new StringBuilder("\uFEFF");
        boolean primera = true;
        for (Seccion s : secciones) {
            if (!primera) sb.append("\r\n");
            primera = false;
            sb.append(celdaCsv(s.titulo())).append("\r\n");
            linea(sb, new ArrayList<Object>(s.columnas()));
            s.filas().forEach(f -> linea(sb, f));
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void linea(StringBuilder sb, List<Object> celdas) {
        for (int i = 0; i < celdas.size(); i++) {
            if (i > 0) sb.append(';');
            sb.append(celdaCsv(comoTexto(celdas.get(i))));
        }
        sb.append("\r\n");
    }

    /** Evita la inyección de fórmulas en Excel (= + @) y escapa ; " y saltos de línea */
    private static String celdaCsv(String texto) {
        String t = texto.matches("(?s)^[=+@\\t\\r].*") ? "'" + texto : texto;
        return t.contains(";") || t.contains("\"") || t.contains("\n") || t.contains("\r")
                ? "\"" + t.replace("\"", "\"\"") + "\"" : t;
    }

    // =====================================================================
    // Excel (.xlsx): una hoja por sección
    // =====================================================================

    private byte[] xlsx(List<Seccion> secciones) {
        try (XSSFWorkbook libro = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            org.apache.poi.ss.usermodel.Font negrita = libro.createFont();
            negrita.setBold(true);
            CellStyle encabezado = libro.createCellStyle();
            encabezado.setFont(negrita);
            encabezado.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            encabezado.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle decimal = libro.createCellStyle();
            decimal.setDataFormat(libro.createDataFormat().getFormat("0.00"));

            XSSFFont blanca = libro.createFont();
            blanca.setColor(IndexedColors.WHITE.getIndex());
            Map<Integer, XSSFCellStyle> estilosCalor = new HashMap<>();

            for (Seccion s : secciones) {
                Sheet hoja = libro.createSheet(WorkbookUtil.createSafeSheetName(s.titulo()));
                boolean pareto = s.tipo() == Tipo.PARETO;
                double maxMatriz = s.tipo() == Tipo.MAPA_CALOR ? maximoMatriz(s) : 0;
                double maxPareto = 0;
                if (pareto) {
                    for (List<Object> fila : s.filas()) maxPareto = Math.max(maxPareto, ((Number) fila.get(1)).doubleValue());
                }

                Row cab = hoja.createRow(0);
                for (int c = 0; c < s.columnas().size(); c++) {
                    Cell celda = cab.createCell(c);
                    celda.setCellValue(s.columnas().get(c));
                    celda.setCellStyle(encabezado);
                }
                if (pareto) {
                    Cell celda = cab.createCell(s.columnas().size());
                    celda.setCellValue("Gráfico");
                    celda.setCellStyle(encabezado);
                }

                int r = 1;
                for (List<Object> fila : s.filas()) {
                    Row row = hoja.createRow(r++);
                    for (int c = 0; c < fila.size(); c++) {
                        Object v = fila.get(c);
                        Cell celda = row.createCell(c);
                        if (v instanceof Number n) {
                            celda.setCellValue(n.doubleValue());
                            if (s.tipo() == Tipo.MAPA_CALOR && c > 0) {
                                double t = intensidad(v, maxMatriz);
                                int paso = t < 0 ? -1 : (int) Math.round(t * 8);
                                celda.setCellStyle(estilosCalor.computeIfAbsent(paso, k -> {
                                    XSSFCellStyle st = libro.createCellStyle();
                                    Color col = calor(k < 0 ? -1 : k / 8.0);
                                    st.setFillForegroundColor(new XSSFColor(
                                            new byte[] {(byte) col.getRed(), (byte) col.getGreen(), (byte) col.getBlue()}, null));
                                    st.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                                    st.setAlignment(HorizontalAlignment.CENTER);
                                    if (k >= 5) st.setFont(blanca);
                                    return st;
                                }));
                            } else if (v instanceof Double || v instanceof Float) {
                                celda.setCellStyle(decimal);
                            }
                        } else {
                            celda.setCellValue(String.valueOf(v)); // texto: Excel nunca lo ejecuta como fórmula
                        }
                    }
                    if (pareto) {
                        // barra hecha con caracteres: muestra el ranking sin depender de un objeto gráfico
                        int largo = maxPareto > 0
                                ? Math.max(1, (int) Math.round(((Number) fila.get(1)).doubleValue() / maxPareto * 30)) : 0;
                        row.createCell(s.columnas().size()).setCellValue("█".repeat(largo));
                    }
                }
                // Ancho fijo: autoSizeColumn necesita fuentes del sistema, que un contenedor puede no tener
                for (int c = 0; c < s.columnas().size(); c++) hoja.setColumnWidth(c, (c == 0 ? 42 : 16) * 256);
                if (pareto) hoja.setColumnWidth(s.columnas().size(), 36 * 256);
            }
            libro.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo generar el archivo Excel", e);
        }
    }

    // =====================================================================
    // PDF
    // =====================================================================

    private byte[] pdf(List<Seccion> secciones, LocalDateTime generado) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 36, 36, 40, 40);
        try {
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            doc.open();

            Font titulo = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, Font.NORMAL, new Color(0x1F, 0x3A, 0x5F));
            Font subtitulo = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12, Font.NORMAL, Color.BLACK);
            Font nota = FontFactory.getFont(FontFactory.HELVETICA, 9, Font.NORMAL, Color.GRAY);
            Font cabecera = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Font.NORMAL, Color.WHITE);
            Font normal = FontFactory.getFont(FontFactory.HELVETICA, 9, Font.NORMAL, Color.BLACK);
            Font blanco = FontFactory.getFont(FontFactory.HELVETICA, 9, Font.NORMAL, Color.WHITE);

            doc.add(new Paragraph("SIVCR - Reporte del dashboard de siniestralidad vial", titulo));
            doc.add(new Paragraph("Generado el "
                    + generado.format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")), nota));

            for (Seccion s : secciones) {
                Paragraph t = new Paragraph(s.titulo(), subtitulo);
                t.setSpacingBefore(14);
                t.setSpacingAfter(5);
                doc.add(t);

                if (s.tipo() == Tipo.PARETO) {
                    Image grafico = graficoPareto(writer, s.filas());
                    if (grafico != null) {
                        grafico.setAlignment(Element.ALIGN_CENTER);
                        doc.add(grafico);
                        doc.add(new Paragraph("Barras: siniestros por ruta (eje izquierdo). Línea: porcentaje acumulado (eje derecho).", nota));
                    }
                }

                double maxMatriz = s.tipo() == Tipo.MAPA_CALOR ? maximoMatriz(s) : 0;
                int n = s.columnas().size();
                PdfPTable tabla = new PdfPTable(n);
                tabla.setWidthPercentage(100);
                float[] anchos = new float[n];
                for (int i = 0; i < n; i++) anchos[i] = i == 0 ? (n == 2 ? 1f : 2f) : (n == 2 ? 2f : 1f);
                tabla.setWidths(anchos);
                tabla.setHeaderRows(1);

                for (String col : s.columnas()) {
                    PdfPCell c = new PdfPCell(new Phrase(col, cabecera));
                    c.setBackgroundColor(new Color(0x1F, 0x3A, 0x5F));
                    c.setPadding(4);
                    tabla.addCell(c);
                }
                for (List<Object> fila : s.filas()) {
                    for (int i = 0; i < fila.size(); i++) {
                        Object v = fila.get(i);
                        boolean calor = s.tipo() == Tipo.MAPA_CALOR && i > 0;
                        double inten = calor ? intensidad(v, maxMatriz) : -1;
                        PdfPCell c = new PdfPCell(new Phrase(comoTexto(v), calor && inten > 0.55 ? blanco : normal));
                        c.setPadding(calor ? 7 : 4);
                        c.setBorderColor(new Color(0xD0, 0xD5, 0xDD));
                        if (calor) {
                            c.setBackgroundColor(calor(inten));
                            c.setHorizontalAlignment(Element.ALIGN_CENTER);
                        } else if (i > 0 && v instanceof Number) {
                            c.setHorizontalAlignment(Element.ALIGN_RIGHT);
                        }
                        tabla.addCell(c);
                    }
                }
                doc.add(tabla);
                if (s.tipo() == Tipo.MAPA_CALOR) {
                    doc.add(new Paragraph("Más oscuro = más siniestros (máx. " + comoTexto((long) maxMatriz)
                            + " en una celda). Gris = sin siniestros.", nota));
                }
            }
        } catch (DocumentException | IOException e) {
            throw new IllegalStateException("No se pudo generar el PDF", e);
        } finally {
            if (doc.isOpen()) doc.close();
        }
        return out.toByteArray();
    }


    private static Image graficoPareto(PdfWriter writer, List<List<Object>> filas) throws DocumentException, IOException {
        if (filas.isEmpty()) return null;
        final float w = 500, h = 200, izq = 42, der = 38, abajo = 30, arriba = 14;
        final float ancho = w - izq - der, alto = h - abajo - arriba;
        final Color azul = new Color(0x2E, 0x6F, 0xB7), naranja = new Color(0xE0, 0x7B, 0x00);

        PdfTemplate t = writer.getDirectContent().createTemplate(w, h);
        BaseFont fuente = BaseFont.createFont(BaseFont.HELVETICA, BaseFont.WINANSI, BaseFont.NOT_EMBEDDED);

        int n = filas.size();
        double max = 1;
        for (List<Object> f : filas) max = Math.max(max, ((Number) f.get(1)).doubleValue());
        float hueco = ancho / n, barra = hueco * 0.6f;

        // rejilla horizontal
        t.setColorStroke(new Color(0xD9, 0xDE, 0xE6));
        t.setLineWidth(0.5f);
        for (int g = 0; g <= 4; g++) {
            float y = abajo + alto * g / 4f;
            t.moveTo(izq, y);
            t.lineTo(izq + ancho, y);
            t.stroke();
        }

        // barras
        t.setColorFill(azul);
        for (int i = 0; i < n; i++) {
            float x = izq + hueco * i + (hueco - barra) / 2;
            float alturaBarra = (float) (((Number) filas.get(i).get(1)).doubleValue() / max * alto);
            t.rectangle(x, abajo, barra, alturaBarra);
            t.fill();
        }

        // línea del acumulado
        t.setColorStroke(naranja);
        t.setLineWidth(1.6f);
        for (int i = 0; i < n; i++) {
            float cx = izq + hueco * i + hueco / 2;
            float y = abajo + (float) (((Number) filas.get(i).get(3)).doubleValue() / 100.0 * alto);
            if (i == 0) t.moveTo(cx, y);
            else t.lineTo(cx, y);
        }
        t.stroke();
        t.setColorFill(naranja);
        for (int i = 0; i < n; i++) {
            float cx = izq + hueco * i + hueco / 2;
            float y = abajo + (float) (((Number) filas.get(i).get(3)).doubleValue() / 100.0 * alto);
            t.circle(cx, y, 2.4f);
            t.fill();
        }

        // textos: ejes y nombres de las rutas
        t.beginText();
        t.setFontAndSize(fuente, 7);
        t.setColorFill(Color.DARK_GRAY);
        for (int g = 0; g <= 4; g++) {
            float y = abajo + alto * g / 4f - 2.5f;
            t.showTextAligned(PdfContentByte.ALIGN_RIGHT, String.valueOf(Math.round(max * g / 4.0)), izq - 4, y, 0);
            t.showTextAligned(PdfContentByte.ALIGN_LEFT, (25 * g) + "%", izq + ancho + 4, y, 0);
        }
        for (int i = 0; i < n; i++) {
            float cx = izq + hueco * i + hueco / 2;
            t.showTextAligned(PdfContentByte.ALIGN_CENTER, String.valueOf(filas.get(i).get(0)), cx, abajo - 11, 0);
        }
        t.endText();

        return Image.getInstance(t);
    }
}
