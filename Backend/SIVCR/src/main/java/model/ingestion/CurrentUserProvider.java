package model.ingestion;

/** Puerto para saber quién está autenticado; la implementación depende del mecanismo de seguridad vigente. */
public interface CurrentUserProvider {

    /** Usuario de la solicitud actual; lanza IngestionException si no se puede identificar en la base de datos. */
    UserRef actual();
}
