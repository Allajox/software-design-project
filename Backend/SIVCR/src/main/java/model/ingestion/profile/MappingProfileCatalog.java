package model.ingestion.profile;

import enums.DataSource;
import java.util.ArrayList;
import java.util.List;

/**
 * Catálogo en memoria de los perfiles de mapeo: producción lo llena desde los YAML del classpath (ver AppConfig);
 * las pruebas, con perfiles armados a mano.
 */
public class MappingProfileCatalog {

    private final List<MappingProfile> perfiles;

    public MappingProfileCatalog(List<MappingProfile> perfiles) {
        this.perfiles = List.copyOf(perfiles);
    }

    public List<MappingProfile> perfilesDe(DataSource fuente) {
        List<MappingProfile> resultado = new ArrayList<>();
        for (MappingProfile p : perfiles) {
            if (p.fuente() == fuente) {
                resultado.add(p);
            }
        }
        return resultado;
    }
}
