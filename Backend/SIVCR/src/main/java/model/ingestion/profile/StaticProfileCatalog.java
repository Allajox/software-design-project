package model.ingestion.profile;

import enums.DataSource;
import java.util.ArrayList;
import java.util.List;

/** Catálogo en memoria (producción lo llena desde YAML; las pruebas, con perfiles armados a mano). */
public class StaticProfileCatalog implements MappingProfileCatalog {

    private final List<MappingProfile> perfiles;

    public StaticProfileCatalog(List<MappingProfile> perfiles) {
        this.perfiles = List.copyOf(perfiles);
    }

    @Override
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
