package model;

/** Puerto de la configuración del sistema. La implementación vive en app.persistence. */
public interface ConfigRepository {

    /** La configuración vigente (la única fila de system_config). */
    SystemConfig leer();
}
