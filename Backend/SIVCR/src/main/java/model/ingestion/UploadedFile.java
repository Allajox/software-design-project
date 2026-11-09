package model.ingestion;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Archivo recibido para ingesta, independiente de Spring (MultipartFile) y del sistema de archivos.
 * open() se puede invocar varias veces: el manager lo lee una vez para el checksum,
 * otra para detectar formato y encabezados y otra para procesar los registros.
 */
public interface UploadedFile {

    /** Nombre original del archivo (sin ruta). */
    String name();

    /** Abre un flujo nuevo desde el inicio; quien lo llama debe cerrarlo. */
    InputStream open() throws IOException;

    static UploadedFile of(Path path) {
        String nombre = path.getFileName().toString();
        return new UploadedFile() {
            @Override
            public String name() {
                return nombre;
            }

            @Override
            public InputStream open() throws IOException {
                return Files.newInputStream(path);
            }
        };
    }

    static UploadedFile of(String nombre, byte[] contenido) {
        return new UploadedFile() {
            @Override
            public String name() {
                return nombre;
            }

            @Override
            public InputStream open() {
                return new ByteArrayInputStream(contenido);
            }
        };
    }
}
