package model.export;

import enums.ExportFormat;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.Charset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import model.Sinister;
import model.dto.ExportFile;
import model.dto.KPIResult;
import model.dto.KPIValue;

/**
 * PDF del reporte: título, ámbito, KPI y la tabla de siniestros en hojas A4 horizontales. Es un PDF 1.4 mínimo escrito
 * a mano con las fuentes estándar (Helvetica y Courier), así no necesita ninguna librería. La tabla usa Courier, de
 * ancho fijo, para alinear las columnas sin medir texto.
 *
 * Un PDF no es un volcado de datos: la tabla se corta en MAX_FILAS registros y el pie lo dice. Para todo el conjunto
 * están el CSV y el Excel.
 */
public class PdfReportWriter implements ReportWriter {

    /** Máximo de registros en la tabla del PDF (unas 100 hojas). */
    static final int MAX_FILAS = 5000;

    private static final Charset WIN_ANSI = Charset.forName("windows-1252");
    private static final double ANCHO = 842, ALTO = 595;
    private static final double MARGEN_X = 28, MARGEN_SUPERIOR = 36, MARGEN_INFERIOR = 34;
    /** Ancho de un carácter de Courier = 0,6 del tamaño de la fuente. */
    private static final double ANCHO_COURIER = 0.6;
    private static final DateTimeFormatter FECHA_Y_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Override
    public ExportFormat formato() {
        return ExportFormat.PDF;
    }

    @Override
    public boolean usaKpis() {
        return true;
    }

    @Override
    public ExportFile escribir(ReportData datos) {
        List<Columnas.Columna> columnas = Columnas.paraPdf();
        int caracteres = columnas.stream().mapToInt(Columnas.Columna::ancho).sum() + 2 * (columnas.size() - 1);
        double tamano = Math.min(7.5, (ANCHO - 2 * MARGEN_X) / (caracteres * ANCHO_COURIER));
        double alturaFila = tamano * 1.45;

        List<Sinister> filas = datos.registros().size() <= MAX_FILAS
            ? datos.registros() : datos.registros().subList(0, MAX_FILAS);

        List<StringBuilder> hojas = new ArrayList<>();
        StringBuilder hoja = nuevaHoja(hojas);
        double y = ALTO - MARGEN_SUPERIOR;

        // ---- encabezado del reporte (solo en la primera hoja)
        y = linea(hoja, "F2", 14, y, "SIVCR - Reporte de siniestros viales") - 4;
        for (String parte : envolver("Ámbito: " + datos.ambito(), 150)) {
            y = linea(hoja, "F1", 9, y, parte);
        }
        String registros = filas.size() == datos.registros().size()
            ? String.valueOf(datos.registros().size())
            : filas.size() + " de " + datos.registros().size() + " (la tabla se limita a " + MAX_FILAS
                + "; el CSV y el Excel traen todos)";
        y = linea(hoja, "F1", 9, y, "Generado: " + datos.generado().format(FECHA_Y_HORA)
            + "   Registros en la tabla: " + registros);
        if (datos.kpis() != null) {
            y = kpis(hoja, y, datos.kpis());
        }
        y -= 8;

        // ---- tabla
        y = encabezadoDeTabla(hoja, y, columnas, tamano, alturaFila);
        if (filas.isEmpty()) {
            linea(hoja, "F1", 9, y, "No hay registros que cumplan los filtros.");
        }
        for (Sinister s : filas) {
            if (y - alturaFila < MARGEN_INFERIOR) {
                hoja = nuevaHoja(hojas);
                y = ALTO - MARGEN_SUPERIOR;
                y = linea(hoja, "F2", 9, y, "SIVCR - Reporte de siniestros viales (continuación)") - 4;
                y = encabezadoDeTabla(hoja, y, columnas, tamano, alturaFila);
            }
            y = fila(hoja, "F3", tamano, y, alturaFila, columnas, s);
        }
        return new ExportFile(armar(hojas, datos), "application/pdf",
            "siniestros-" + datos.generado().format(DateTimeFormatter.ISO_LOCAL_DATE) + ".pdf");
    }

    // ------------------------------------------------------------------------------------------ contenido

    private static StringBuilder nuevaHoja(List<StringBuilder> hojas) {
        StringBuilder hoja = new StringBuilder();
        hojas.add(hoja);
        return hoja;
    }

    /** Dibuja una línea de texto con su base en y y devuelve la y de la línea siguiente. */
    private static double linea(StringBuilder hoja, String fuente, double tamano, double y, String texto) {
        hoja.append("BT /").append(fuente).append(' ').append(num(tamano)).append(" Tf ")
            .append(num(MARGEN_X)).append(' ').append(num(y - tamano)).append(" Td (")
            .append(escapar(texto)).append(") Tj ET\n");
        return y - tamano * 1.4;
    }

    private static double kpis(StringBuilder hoja, double y, KPIResult k) {
        y = linea(hoja, "F2", 9, y - 4, "Indicadores");
        y = linea(hoja, "F1", 9, y, "Siniestros válidos: " + k.totalRecords()
            + "     TSV: " + valor(k.tsv().global())
            + "     ISS: " + valor(k.iss())
            + "     TPR: " + valor(k.tpr())
            + "     Condiciones adversas: " + valor(k.adverseConditionsPct()));
        return y;
    }

    private static String valor(KPIValue v) {
        if (v.value() == null) {
            return "sin datos";
        }
        String unidad = "%".equals(v.unit()) ? " %" : " " + v.unit();
        return String.format(Locale.ROOT, "%.2f", v.value()).replace('.', ',') + unidad;
    }

    private static double encabezadoDeTabla(StringBuilder hoja, double y, List<Columnas.Columna> columnas,
                                            double tamano, double alturaFila) {
        List<String> titulos = new ArrayList<>();
        for (Columnas.Columna c : columnas) {
            titulos.add(c.titulo());
        }
        double siguiente = fila(hoja, "F4", tamano, y, alturaFila, columnas, titulos);
        double lineaY = siguiente + (alturaFila - tamano) / 2;
        hoja.append("0.5 w ").append(num(MARGEN_X)).append(' ').append(num(lineaY)).append(" m ")
            .append(num(ANCHO - MARGEN_X)).append(' ').append(num(lineaY)).append(" l S\n");
        return siguiente - 2;
    }

    private static double fila(StringBuilder hoja, String fuente, double tamano, double y, double alturaFila,
                               List<Columnas.Columna> columnas, Sinister s) {
        List<String> celdas = new ArrayList<>();
        for (Columnas.Columna c : columnas) {
            celdas.add(Columnas.texto(c.valor().apply(s)));
        }
        return fila(hoja, fuente, tamano, y, alturaFila, columnas, celdas);
    }

    /** Una fila de la tabla: cada celda se corta o se rellena a su ancho y todas salen en una sola línea. */
    private static double fila(StringBuilder hoja, String fuente, double tamano, double y, double alturaFila,
                               List<Columnas.Columna> columnas, List<String> celdas) {
        StringBuilder texto = new StringBuilder();
        for (int i = 0; i < columnas.size(); i++) {
            if (i > 0) {
                texto.append("  ");
            }
            texto.append(ajustar(celdas.get(i), columnas.get(i).ancho()));
        }
        return linea(hoja, fuente, tamano, y, texto.toString(), alturaFila);
    }

    private static double linea(StringBuilder hoja, String fuente, double tamano, double y, String texto,
                                double alturaFila) {
        hoja.append("BT /").append(fuente).append(' ').append(num(tamano)).append(" Tf ")
            .append(num(MARGEN_X)).append(' ').append(num(y - tamano)).append(" Td (")
            .append(escapar(texto)).append(") Tj ET\n");
        return y - alturaFila;
    }

    /** Corta (con puntos suspensivos) o rellena con espacios hasta exactamente "ancho" caracteres. */
    static String ajustar(String texto, int ancho) {
        String t = texto == null ? "" : texto.replace('\n', ' ').replace('\r', ' ');
        if (t.length() > ancho) {
            return t.substring(0, ancho - 1) + "…";
        }
        return t + " ".repeat(ancho - t.length());
    }

    /** Parte un texto en líneas de hasta "max" caracteres, cortando entre palabras. */
    static List<String> envolver(String texto, int max) {
        List<String> lineas = new ArrayList<>();
        StringBuilder actual = new StringBuilder();
        for (String palabra : texto.split(" ")) {
            if (actual.length() > 0 && actual.length() + 1 + palabra.length() > max) {
                lineas.add(actual.toString());
                actual.setLength(0);
            }
            if (actual.length() > 0) {
                actual.append(' ');
            }
            actual.append(palabra);
        }
        lineas.add(actual.toString());
        return lineas;
    }

    // ----------------------------------------------------------------------------------------- estructura PDF

    /**
     * Arma el archivo: 1 catálogo, 2 páginas, 3-6 fuentes, 7 información y, por cada hoja, un objeto de página y uno de
     * contenido. Todo el archivo se codifica en windows-1252, la codificación de las fuentes (WinAnsi): así las tildes y
     * las eñes salen bien. Los desplazamientos de la tabla xref se miden sobre los bytes ya codificados.
     */
    private static byte[] armar(List<StringBuilder> hojas, ReportData datos) {
        int paginas = hojas.size();
        List<String> objetos = new ArrayList<>();
        objetos.add("<< /Type /Catalog /Pages 2 0 R >>");
        StringBuilder hijas = new StringBuilder();
        for (int i = 0; i < paginas; i++) {
            hijas.append(8 + 2 * i).append(" 0 R ");
        }
        objetos.add("<< /Type /Pages /Kids [" + hijas + "] /Count " + paginas + " >>");
        objetos.add(fuente("Helvetica"));
        objetos.add(fuente("Helvetica-Bold"));
        objetos.add(fuente("Courier"));
        objetos.add(fuente("Courier-Bold"));
        objetos.add("<< /Title (SIVCR - Reporte de siniestros viales) /Producer (SIVCR) /CreationDate (D:"
            + datos.generado().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")) + ") >>");
        for (int i = 0; i < paginas; i++) {
            objetos.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + num(ANCHO) + " " + num(ALTO) + "] "
                + "/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents "
                + (9 + 2 * i) + " 0 R >>");
            StringBuilder contenido = new StringBuilder(hojas.get(i));
            contenido.append("BT /F1 8 Tf ").append(num(MARGEN_X)).append(" 18 Td (Página ").append(i + 1)
                .append(" de ").append(paginas).append(") Tj ET\n");
            String flujo = contenido.toString();
            objetos.add("<< /Length " + flujo.getBytes(WIN_ANSI).length + " >>\nstream\n" + flujo + "\nendstream");
        }

        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        try {
            salida.write("%PDF-1.4\n".getBytes(WIN_ANSI));
            salida.write(new byte[] {'%', (byte) 0xE2, (byte) 0xE3, (byte) 0xCF, (byte) 0xD3, '\n'});
            int[] posiciones = new int[objetos.size() + 1];
            for (int i = 0; i < objetos.size(); i++) {
                posiciones[i + 1] = salida.size();
                salida.write(((i + 1) + " 0 obj\n" + objetos.get(i) + "\nendobj\n").getBytes(WIN_ANSI));
            }
            int xref = salida.size();
            StringBuilder tabla = new StringBuilder("xref\n0 " + (objetos.size() + 1) + "\n0000000000 65535 f \n");
            for (int i = 1; i <= objetos.size(); i++) {
                tabla.append(String.format(Locale.ROOT, "%010d 00000 n \n", posiciones[i]));
            }
            tabla.append("trailer\n<< /Size ").append(objetos.size() + 1)
                .append(" /Root 1 0 R /Info 7 0 R >>\nstartxref\n").append(xref).append("\n%%EOF\n");
            salida.write(tabla.toString().getBytes(WIN_ANSI));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return salida.toByteArray();
    }

    private static String fuente(String nombre) {
        return "<< /Type /Font /Subtype /Type1 /BaseFont /" + nombre + " /Encoding /WinAnsiEncoding >>";
    }

    /** Texto como cadena literal de PDF: se escapan \, ( y ) y se quitan los saltos de línea. */
    private static String escapar(String texto) {
        return texto.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            .replace("\r", " ").replace("\n", " ");
    }

    private static String num(double valor) {
        return String.format(Locale.ROOT, "%.2f", valor);
    }
}
