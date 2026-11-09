package model.ingestion.profile;

import enums.DataSource;
import java.util.List;

/** Origen de los perfiles de mapeo. La implementación de producción los lee de YAML en el classpath. */
public interface MappingProfileCatalog {

    List<MappingProfile> perfilesDe(DataSource fuente);
}
