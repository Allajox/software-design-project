package app.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import model.ingestion.GeoBounds;
import model.ingestion.IngestionLogRepository;
import model.ingestion.IngestionManager;
import model.ingestion.QualityReportRepository;
import model.ingestion.RecordRepository;
import model.ingestion.parser.FileParserFactory;
import model.ingestion.profile.MappingProfile;
import model.ingestion.profile.MappingProfileCatalog;
import model.ingestion.profile.ProfileParser;
import model.ingestion.profile.StaticProfileCatalog;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * Conecta el dominio de ingesta (que no conoce Spring) con sus adaptadores. Aquí y en app.persistence
 * es el único lugar donde se ensamblan las piezas.
 */
@Configuration
@EnableConfigurationProperties(IngestionProperties.class)
public class IngestionConfig {

    /** Carga todos los YAML de perfiles al arrancar: un perfil mal escrito impide iniciar la aplicación. */
    @Bean
    public MappingProfileCatalog mappingProfileCatalog(IngestionProperties propiedades) throws IOException {
        Resource[] recursos = new PathMatchingResourcePatternResolver().getResources(propiedades.perfiles());
        Arrays.sort(recursos, Comparator.comparing(r -> String.valueOf(r.getFilename())));

        List<MappingProfile> perfiles = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (Resource recurso : recursos) {
            try (InputStream in = recurso.getInputStream()) {
                MappingProfile perfil = ProfileParser.leer(in, String.valueOf(recurso.getFilename()));
                if (!ids.add(perfil.id())) {
                    throw new IllegalStateException("Perfil de ingesta duplicado: " + perfil.id());
                }
                perfiles.add(perfil);
            }
        }
        if (perfiles.isEmpty()) {
            throw new IllegalStateException("No se encontró ningún perfil de ingesta en " + propiedades.perfiles());
        }
        return new StaticProfileCatalog(perfiles);
    }

    @Bean
    public FileParserFactory fileParserFactory() {
        return new FileParserFactory();
    }

    @Bean
    public GeoBounds limitesGeograficos() {
        return GeoBounds.COSTA_RICA;
    }

    @Bean
    public IngestionManager ingestionManager(FileParserFactory fabrica, MappingProfileCatalog perfiles,
                                             IngestionLogRepository logs, QualityReportRepository reportes,
                                             @Qualifier("sinisterRecordRepository") RecordRepository siniestros,
                                             @Qualifier("victimRecordRepository") RecordRepository victimas,
                                             GeoBounds limites, IngestionProperties propiedades) {
        return new IngestionManager(fabrica, perfiles, logs, reportes, siniestros, victimas, limites,
                propiedades.tamanoLote(), propiedades.maxErrores());
    }
}
