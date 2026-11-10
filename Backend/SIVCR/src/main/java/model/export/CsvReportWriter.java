package model.export;

import enums.ExportFormat;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import model.Sinister;
import model.dto.ExportFile;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;

/**
 * CSV de la tabla de siniestros: UTF-8 con BOM (Excel abre bien las tildes) y separador ";" (igual que los archivos de
 * COSEVI y que Excel en español). Los decimales llevan punto. Es solo la tabla: sin resumen, para poder volver a
 * procesarla.
 */
public class CsvReportWriter implements ReportWriter {

    private static final CSVFormat FORMATO = CSVFormat.DEFAULT.builder()
        .setDelimiter(';').setRecordSeparator("\r\n").build();

    @Override
    public ExportFormat formato() {
        return ExportFormat.CSV;
    }

    @Override
    public ExportFile escribir(ReportData datos) {
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        try (OutputStreamWriter escritor = new OutputStreamWriter(salida, StandardCharsets.UTF_8);
             CSVPrinter impresor = new CSVPrinter(escritor, FORMATO)) {
            escritor.write('﻿');
            List<String> titulos = new ArrayList<>();
            for (Columnas.Columna c : Columnas.TODAS) {
                titulos.add(c.titulo());
            }
            impresor.printRecord(titulos);
            for (Sinister s : datos.registros()) {
                List<String> fila = new ArrayList<>(Columnas.TODAS.size());
                for (Columnas.Columna c : Columnas.TODAS) {
                    fila.add(seguro(c.valor().apply(s)));
                }
                impresor.printRecord(fila);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        String nombre = "siniestros-" + datos.generado().format(DateTimeFormatter.ISO_LOCAL_DATE) + ".csv";
        return new ExportFile(salida.toByteArray(), "text/csv; charset=UTF-8", nombre);
    }

    /**
     * Un texto que empieza con = + - @ lo interpreta Excel como fórmula (inyección de fórmulas): se antepone una comilla.
     * Los números no se tocan.
     */
    private static String seguro(Object valor) {
        String texto = Columnas.texto(valor);
        if (valor instanceof String && !texto.isEmpty() && "=+-@\t\r".indexOf(texto.charAt(0)) >= 0) {
            return "'" + texto;
        }
        return texto;
    }
}
