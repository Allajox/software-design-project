package app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Parámetros de la ingesta (application.yml, prefijo sivcr.ingestion). */
@ConfigurationProperties(prefix = "sivcr.ingestion")
public record IngestionProperties(
        @DefaultValue("1000") int tamanoLote,
        @DefaultValue("1000") int maxErrores,
        @DefaultValue("classpath*:ingestion/profiles/*.yml") String perfiles) {
}
