package model;

import java.util.Locale;
import java.util.Map;

/**
 * Texto en español para mostrar los valores de los enums (tarjetas, gráficos y archivos exportados). Los nombres de los
 * enums no llevan tildes ni espacios (SAN_JOSE, MANANA): aquí se convierten en lo que lee una persona. Sin dependencias
 * del framework.
 */
public final class Etiquetas {

    // Solo los que no salen bien con la regla general (tildes, eñes)
    private static final Map<String, String> ESPECIALES = Map.of(
        "SAN_JOSE", "San José",
        "LIMON", "Limón",
        "MANANA", "Mañana",
        "MIERCOLES", "Miércoles",
        "SABADO", "Sábado",
        "CONSTRUCCION_O_REPARACION", "Construcción o reparación",
        "TRANSPORTE_PUBLICO", "Transporte público",
        "ACOMPANANTE", "Acompañante",
        "PEATON", "Peatón");

    private Etiquetas() { }

    /** null si el valor es null; si no, "SAN_JOSE" -> "San José", "LLUVIA_CON_NEBLINA" -> "Lluvia con neblina". */
    public static String de(Enum<?> valor) {
        return valor == null ? null : de(valor.name());
    }

    /** Igual que de(Enum) pero desde el nombre del enum (como viene de la base de datos). */
    public static String de(String nombre) {
        if (nombre == null || nombre.isBlank()) {
            return nombre;
        }
        String especial = ESPECIALES.get(nombre);
        if (especial != null) {
            return especial;
        }
        String texto = nombre.replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(texto.charAt(0)) + texto.substring(1);
    }
}
