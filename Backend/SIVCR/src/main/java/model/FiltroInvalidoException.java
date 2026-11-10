package model;

/** Filtro o parámetro de consulta inválido (el mensaje es legible para el usuario). */
public class FiltroInvalidoException extends SivcrException {

    private static final long serialVersionUID = 1L;

    public FiltroInvalidoException(String mensaje) {
        super(Tipo.SOLICITUD_INVALIDA, mensaje);
    }
}
