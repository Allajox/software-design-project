package app.config;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import model.FilterRepository;
import model.PasswordHasher;
import model.SinisterRepository;
import model.UserRepository;
import model.VictimRepository;
import model.ingestion.GeoBounds;
import model.ingestion.IngestionLogRepository;
import model.ingestion.IngestionManager;
import model.ingestion.RecordRepository;
import model.ingestion.parser.FileParserFactory;
import model.ingestion.profile.MappingProfile;
import model.ingestion.profile.MappingProfileCatalog;
import model.ingestion.profile.ProfileParser;
import model.managers.AuthManager;
import model.managers.FilterManager;
import model.managers.HistoryManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * Conecta el dominio (managers y servicios sin Spring) con sus adaptadores: aquí y en app.persistence es el único lugar
 * donde se ensamblan las piezas. La seguridad (roles, filtro del token) está en SecurityConfig.
 */
@Configuration
public class AppConfig {

    /** Carga todos los YAML de perfiles al arrancar: un perfil mal escrito impide iniciar la aplicación. */
    @Bean
    public MappingProfileCatalog mappingProfileCatalog(
            @Value("${sivcr.ingestion.perfiles:classpath*:ingestion/profiles/*.yml}") String ubicacion)
            throws IOException {
        Resource[] recursos = new PathMatchingResourcePatternResolver().getResources(ubicacion);
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
            throw new IllegalStateException("No se encontró ningún perfil de ingesta en " + ubicacion);
        }
        return new MappingProfileCatalog(perfiles);
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
                                             IngestionLogRepository logs, RecordRepository registros,
                                             GeoBounds limites,
                                             @Value("${sivcr.ingestion.tamano-lote:1000}") int tamanoLote,
                                             @Value("${sivcr.ingestion.max-errores:1000}") int maxErrores) {
        return new IngestionManager(fabrica, perfiles, logs, registros, limites, tamanoLote, maxErrores);
    }

    @Bean
    public PasswordHasher passwordHasher(@Value("${sivcr.auth.iteraciones:600000}") int iteraciones) {
        return new PasswordHasher(iteraciones);
    }

    /** Las sesiones duran lo que indique sivcr.auth.duracion-minutos desde el login (no se renuevan). */
    @Bean
    public AuthManager authManager(UserRepository usuarios, PasswordHasher hasher,
                                   @Value("${sivcr.auth.duracion-minutos:120}") long minutos) {
        return new AuthManager(usuarios, hasher, Duration.ofMinutes(minutos), Clock.systemUTC());
    }

    @Bean
    public FilterManager filterManager(SinisterRepository siniestros, VictimRepository victimas,
                                       FilterRepository filtros) {
        return new FilterManager(siniestros, victimas, filtros);
    }

    @Bean
    public HistoryManager historyManager(FilterRepository filtros) {
        return new HistoryManager(filtros);
    }
}
