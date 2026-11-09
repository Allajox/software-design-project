package app.persistence;

import java.time.LocalDateTime;
import java.util.Map;

/** Lectura tipada de los campos normalizados que produce DataValidator. Ausente = null. */
final class Campos {

    private Campos() {
    }

    static String texto(Map<String, Object> campos, String nombre) {
        Object v = campos.get(nombre);
        return v == null ? null : v.toString();
    }

    static Short corto(Map<String, Object> campos, String nombre) {
        Object v = campos.get(nombre);
        return v instanceof Number n ? Short.valueOf(n.shortValue()) : null;
    }

    static Integer entero(Map<String, Object> campos, String nombre) {
        Object v = campos.get(nombre);
        return v instanceof Number n ? Integer.valueOf(n.intValue()) : null;
    }

    static Double decimal(Map<String, Object> campos, String nombre) {
        Object v = campos.get(nombre);
        return v instanceof Number n ? Double.valueOf(n.doubleValue()) : null;
    }

    static LocalDateTime fecha(Map<String, Object> campos, String nombre) {
        Object v = campos.get(nombre);
        return v instanceof LocalDateTime f ? f : null;
    }
}
