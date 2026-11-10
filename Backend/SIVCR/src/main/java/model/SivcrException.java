package model;

/**
 * Único error "de uso" del sistema: lleva el tipo de falla (que la capa web traduce a un estado HTTP en un solo lugar,
 * ApiExceptionHandler) y un mensaje apto para mostrarse al usuario. No depende de Spring.
 * IngestionException y FiltroInvalidoException son su variante "solicitud inválida".
 */
public class SivcrException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public enum Tipo {
        SOLICITUD_INVALIDA(400), NO_AUTENTICADO(401), SIN_PERMISO(403), NO_ENCONTRADO(404), CONFLICTO(409);

        public final int http;

        Tipo(int http) {
            this.http = http;
        }
    }

    private final Tipo tipo;

    public SivcrException(Tipo tipo, String mensaje) {
        super(mensaje);
        this.tipo = tipo;
    }

    public SivcrException(Tipo tipo, String mensaje, Throwable causa) {
        super(mensaje, causa);
        this.tipo = tipo;
    }

    public Tipo tipo() {
        return tipo;
    }
}
