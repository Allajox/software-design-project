package model.export;

import enums.ExportFormat;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.format.DateTimeFormatter;
import model.Sinister;
import model.dto.ExportFile;
import model.dto.KPIResult;
import model.dto.KPIValue;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

/**
 * Libro de Excel con dos hojas: "Resumen" (ámbito, fecha y KPI) y "Registros" (la tabla). Escribe en modo de flujo
 * (SXSSF): mantiene en memoria solo unas filas a la vez, así 90 000 siniestros no agotan la memoria.
 */
public class ExcelReportWriter implements ReportWriter {

    private static final int FILAS_EN_MEMORIA = 200;
    private static final String MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final DateTimeFormatter FECHA_Y_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Override
    public ExportFormat formato() {
        return ExportFormat.EXCEL;
    }

    @Override
    public boolean usaKpis() {
        return true;
    }

    @Override
    public ExportFile escribir(ReportData datos) {
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        SXSSFWorkbook libro = new SXSSFWorkbook(FILAS_EN_MEMORIA);
        try {
            CellStyle negrita = estiloNegrita(libro);
            CellStyle encabezado = estiloEncabezado(libro);
            CellStyle decimales = libro.createCellStyle();
            decimales.setDataFormat(libro.createDataFormat().getFormat("0.00"));

            resumen(libro.createSheet("Resumen"), datos, negrita, encabezado, decimales);
            registros(libro.createSheet("Registros"), datos, encabezado);
            libro.write(salida);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            libro.dispose(); // borra los archivos temporales del modo de flujo
        }
        String nombre = "siniestros-" + datos.generado().format(DateTimeFormatter.ISO_LOCAL_DATE) + ".xlsx";
        return new ExportFile(salida.toByteArray(), MIME, nombre);
    }

    private static void resumen(SXSSFSheet hoja, ReportData datos, CellStyle negrita, CellStyle encabezado,
                                CellStyle decimales) {
        hoja.setColumnWidth(0, 34 * 256);
        hoja.setColumnWidth(1, 16 * 256);
        hoja.setColumnWidth(2, 12 * 256);
        hoja.setColumnWidth(3, 90 * 256);

        int fila = 0;
        texto(hoja.createRow(fila++), 0, "SIVCR - Reporte de siniestros viales", negrita);
        par(hoja.createRow(fila++), "Ámbito", datos.ambito(), negrita);
        par(hoja.createRow(fila++), "Generado", datos.generado().format(FECHA_Y_HORA), negrita);
        par(hoja.createRow(fila++), "Registros en la hoja \"Registros\"", datos.registros().size(), negrita);
        fila++;

        KPIResult kpis = datos.kpis();
        if (kpis == null) {
            return;
        }
        Row titulos = hoja.createRow(fila++);
        texto(titulos, 0, "Indicador", encabezado);
        texto(titulos, 1, "Valor", encabezado);
        texto(titulos, 2, "Unidad", encabezado);
        texto(titulos, 3, "Ámbito", encabezado);

        Row total = hoja.createRow(fila++);
        texto(total, 0, "Siniestros válidos", null);
        total.createCell(1).setCellValue(kpis.totalRecords());
        indicador(hoja.createRow(fila++), "Tasa de siniestralidad vial (TSV)", kpis.tsv().global(), decimales);
        indicador(hoja.createRow(fila++), "Índice de severidad (ISS)", kpis.iss(), decimales);
        indicador(hoja.createRow(fila++), "Tiempo promedio de respuesta (TPR)", kpis.tpr(), decimales);
        indicador(hoja.createRow(fila++), "Condiciones adversas (clima o calzada)", kpis.adverseConditionsPct(),
            decimales);
    }

    private static void registros(SXSSFSheet hoja, ReportData datos, CellStyle encabezado) {
        Row titulos = hoja.createRow(0);
        for (int i = 0; i < Columnas.TODAS.size(); i++) {
            Columnas.Columna c = Columnas.TODAS.get(i);
            texto(titulos, i, c.titulo(), encabezado);
            hoja.setColumnWidth(i, Math.max(c.ancho(), c.titulo().length() + 3) * 256);
        }
        int fila = 1;
        for (Sinister s : datos.registros()) {
            Row row = hoja.createRow(fila++);
            for (int i = 0; i < Columnas.TODAS.size(); i++) {
                Object valor = Columnas.TODAS.get(i).valor().apply(s);
                if (valor instanceof Number numero) {
                    row.createCell(i).setCellValue(numero.doubleValue());
                } else if (valor != null) {
                    row.createCell(i).setCellValue(valor.toString()); // celda de texto: nunca se evalúa como fórmula
                }
            }
        }
        hoja.createFreezePane(0, 1);
        hoja.setAutoFilter(new CellRangeAddress(0, Math.max(0, fila - 1), 0, Columnas.TODAS.size() - 1));
    }

    private static void indicador(Row fila, String nombre, KPIValue valor, CellStyle decimales) {
        texto(fila, 0, nombre, null);
        if (valor.value() == null) {
            texto(fila, 1, "Sin datos", null);
        } else {
            Cell celda = fila.createCell(1);
            celda.setCellValue(valor.value());
            celda.setCellStyle(decimales);
        }
        texto(fila, 2, valor.unit(), null);
        texto(fila, 3, valor.scope(), null);
    }

    private static void par(Row fila, String nombre, Object valor, CellStyle negrita) {
        texto(fila, 0, nombre, negrita);
        if (valor instanceof Number numero) {
            fila.createCell(1).setCellValue(numero.doubleValue());
        } else {
            fila.createCell(1).setCellValue(String.valueOf(valor));
        }
    }

    private static void texto(Row fila, int columna, String valor, CellStyle estilo) {
        Cell celda = fila.createCell(columna);
        celda.setCellValue(valor);
        if (estilo != null) {
            celda.setCellStyle(estilo);
        }
    }

    private static CellStyle estiloNegrita(SXSSFWorkbook libro) {
        Font fuente = libro.createFont();
        fuente.setBold(true);
        CellStyle estilo = libro.createCellStyle();
        estilo.setFont(fuente);
        return estilo;
    }

    private static CellStyle estiloEncabezado(SXSSFWorkbook libro) {
        CellStyle estilo = estiloNegrita(libro);
        estilo.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        estilo.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return estilo;
    }
}
