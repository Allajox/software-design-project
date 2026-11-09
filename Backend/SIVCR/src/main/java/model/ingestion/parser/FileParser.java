package model.ingestion.parser;

import enums.FileFormat;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import model.ingestion.ParseOptions;
import model.ingestion.SinisterBruteData;
import model.ingestion.UploadedFile;

/**
 * Lee un archivo y entrega sus filas crudas.
 *
 * Diferencia con el diagrama: parse(file) solo devuelve List<SinisterBruteData>, lo que obliga a
 * tener todo el archivo en memoria (COSEVI trae ~93 000 filas y el archivo de personas ~199 000).
 * Por eso la operación principal es la variante con Consumer, que entrega las filas una a una;
 * parse(file) queda como conveniencia construida sobre ella.
 */
public interface FileParser {

    FileFormat formato();

    /** Encabezados de columna tal como vienen en el archivo (ya limpios), en orden. */
    List<String> leerEncabezados(UploadedFile archivo, ParseOptions opciones) throws IOException;

    /** Entrega cada fila de datos a destino sin acumularlas. */
    void parse(UploadedFile archivo, ParseOptions opciones, Consumer<SinisterBruteData> destino) throws IOException;

    default List<SinisterBruteData> parse(UploadedFile archivo, ParseOptions opciones) throws IOException {
        List<SinisterBruteData> filas = new ArrayList<>();
        parse(archivo, opciones, filas::add);
        return filas;
    }

    default List<SinisterBruteData> parse(UploadedFile archivo) throws IOException {
        return parse(archivo, ParseOptions.porDefecto());
    }
}
