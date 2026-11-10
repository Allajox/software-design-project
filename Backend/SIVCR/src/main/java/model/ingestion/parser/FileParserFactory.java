package model.ingestion.parser;

import enums.FileFormat;

/**
 * Patrón creacional Factory del bloque de ingesta: decide qué FileParser concreto corresponde
 * a cada formato. Agregar un formato nuevo implica un valor en FileFormat, un parser y una rama aquí.
 */
public class FileParserFactory {

    public FileParser crear(FileFormat formato) {
        if (formato == null) {
            throw new IllegalArgumentException("El formato es obligatorio.");
        }
        return switch (formato) {
            case CSV -> new CsvParser();
            case JSON -> new JsonParser();
            case EXCEL -> new ExcelParser();
        };
    }
}
