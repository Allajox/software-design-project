package controller;

import java.io.IOException;
import java.io.InputStream;
import model.ingestion.UploadedFile;
import org.springframework.web.multipart.MultipartFile;

/** Adaptador: presenta un MultipartFile de Spring como UploadedFile del dominio. */
class MultipartUploadedFile implements UploadedFile {

    private final MultipartFile archivo;

    MultipartUploadedFile(MultipartFile archivo) {
        this.archivo = archivo;
    }

    @Override
    public String name() {
        String original = archivo.getOriginalFilename();
        if (original == null || original.isBlank()) {
            return "archivo";
        }
        // se descarta cualquier ruta que envíe el cliente
        int corte = Math.max(original.lastIndexOf('/'), original.lastIndexOf('\\'));
        return corte >= 0 ? original.substring(corte + 1) : original;
    }

    @Override
    public InputStream open() throws IOException {
        return archivo.getInputStream();
    }
}
