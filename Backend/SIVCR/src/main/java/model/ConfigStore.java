package model;

/**
 * Puerto de la configuración del sistema cuando además se puede cambiar (HU 30). Los que solo la leen (StatsManager)
 * usan ConfigRepository; ConfigManager usa este. La implementación vive en app.persistence.
 */
public interface ConfigStore extends ConfigRepository {

    /**
     * Reemplaza la configuración vigente y deja registrado quién y cuándo la cambió. Los datos ya vienen validados
     * por ConfigManager; esta capa solo los guarda.
     */
    void guardar(SystemConfig config, long usuarioId);
}
