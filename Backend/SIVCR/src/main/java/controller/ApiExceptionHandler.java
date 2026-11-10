package controller;

import java.util.Map;
import model.SivcrException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Único traductor de errores de uso a {"mensaje": "..."}; el estado HTTP sale del tipo de la excepción. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(SivcrException.class)
    public ResponseEntity<Map<String, String>> sivcr(SivcrException e) {
        return ResponseEntity.status(e.tipo().http).body(Map.of("mensaje", e.getMessage()));
    }
}
