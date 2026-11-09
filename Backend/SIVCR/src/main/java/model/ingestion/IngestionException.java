package model.ingestion;

/** Falla controlada de la ingesta: el mensaje es apto para mostrarse al administrador. */
public class IngestionException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public IngestionException(String message) {
        super(message);
    }

    public IngestionException(String message, Throwable cause) {
        super(message, cause);
    }
}
