package model.ingestion;

import model.SivcrException;

/** Falla controlada de la ingesta: el mensaje es apto para mostrarse al administrador. */
public class IngestionException extends SivcrException {

    private static final long serialVersionUID = 1L;

    public IngestionException(String message) {
        super(Tipo.SOLICITUD_INVALIDA, message);
    }

    public IngestionException(String message, Throwable cause) {
        super(Tipo.SOLICITUD_INVALIDA, message, cause);
    }
}
