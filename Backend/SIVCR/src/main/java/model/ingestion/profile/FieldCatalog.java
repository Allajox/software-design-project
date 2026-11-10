package model.ingestion.profile;

import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Campos destino que un perfil puede llenar, con el tipo y los límites de la columna que los recibe en
 * PostgreSQL (V1, V2 y V3). Sirve para que un YAML mal escrito falle al arrancar y no al insertar,
 * y para que ningún valor viole un CHECK o una longitud de columna.
 */
public final class FieldCatalog {

    public enum Target { TEXT, SHORT, INT, DOUBLE, TIMESTAMP }

    /** maxLongitud aplica a TEXT; min/max (inclusive) a SHORT, INT y DOUBLE; null = sin límite. */
    public record Spec(Target destino, int maxLongitud, Double min, Double max) {
    }

    private static final Map<RecordKind, Map<String, Spec>> CAMPOS = new EnumMap<>(RecordKind.class);

    static {
        Map<String, Spec> siniestro = new LinkedHashMap<>();
        siniestro.put("fecha", new Spec(Target.TIMESTAMP, 0, null, null));
        siniestro.put("anio", corto(1900, 2100));
        siniestro.put("mes", corto(1, 12));
        siniestro.put("dia_semana", texto(10));
        siniestro.put("hora", corto(0, 23));
        siniestro.put("franja", texto(12));
        siniestro.put("provincia", texto(20));
        siniestro.put("canton", texto(80));
        siniestro.put("distrito", texto(80));
        siniestro.put("ruta", texto(40));
        siniestro.put("km", new Spec(Target.DOUBLE, 0, 0.0, null));
        siniestro.put("lat", new Spec(Target.DOUBLE, 0, -90.0, 90.0));
        siniestro.put("lon", new Spec(Target.DOUBLE, 0, -180.0, 180.0));
        siniestro.put("tipo_vehiculo", texto(30));
        siniestro.put("severidad", texto(30));
        siniestro.put("clima", texto(30));
        siniestro.put("calzada", texto(30));
        siniestro.put("tiempo_respuesta_min", new Spec(Target.DOUBLE, 0, 0.0, null));
        siniestro.put("tipo_accidente", texto(40));
        siniestro.put("tipo_ruta", texto(30));
        siniestro.put("zona", texto(15));
        CAMPOS.put(RecordKind.SINISTER, siniestro);

        Map<String, Spec> victima = new LinkedHashMap<>();
        victima.put("anio", corto(1900, 2100));
        victima.put("mes", corto(1, 12));
        victima.put("dia_semana", texto(10));
        victima.put("provincia", texto(20));
        victima.put("canton", texto(80));
        victima.put("distrito", texto(80));
        victima.put("edad", new Spec(Target.INT, 0, 0.0, 120.0));
        victima.put("genero", texto(12));
        victima.put("condicion", texto(20));
        victima.put("rol", texto(40));
        victima.put("tipo_lesion", texto(30));
        victima.put("vehiculo", texto(40));
        victima.put("edad_quinquenal", texto(20));
        CAMPOS.put(RecordKind.VICTIM, victima);
    }

    private FieldCatalog() {
    }

    private static Spec texto(int longitud) {
        return new Spec(Target.TEXT, longitud, null, null);
    }

    private static Spec corto(int min, int max) {
        return new Spec(Target.SHORT, 0, (double) min, (double) max);
    }

    public static Optional<Spec> buscar(RecordKind tipo, String campo) {
        return Optional.ofNullable(CAMPOS.get(tipo).get(campo));
    }
}
