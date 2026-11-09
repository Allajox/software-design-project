package controller;

import java.util.Map;
import model.ingestion.IngestionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/** Traduce los errores de uso de la ingesta a respuestas JSON {"mensaje": "..."}. */
@RestControllerAdvice(assignableTypes = IngestionController.class)
public class IngestionExceptionHandler {

    @ExceptionHandler(IngestionException.class)
    public ResponseEntity<Map<String, String>> ingestion(IngestionException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("mensaje", e.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> archivoMuyGrande(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("mensaje", "El archivo supera el tamaño máximo permitido."));
    }
}
