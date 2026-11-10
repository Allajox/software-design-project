package app.persistence;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import model.ingestion.NormalizedRecord;
import model.ingestion.RecordRepository;
import model.ingestion.profile.RecordKind;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inserta por lotes las filas ya validadas en sinister o victim según su tipo. Los campos normalizados que produce
 * DataValidator se llaman igual que las columnas, así que el INSERT se arma con la lista de columnas de cada tabla.
 * Cada llamada a saveAll es una transacción: el manager la invoca una vez por lote (tamano-lote filas).
 *
 * Los ids salen de sinister_seq y victim_seq (INCREMENT BY 50, ver V1): quedan huecos entre ids, lo cual no importa.
 */
@Repository
public class JdbcRecordRepository implements RecordRepository {

    private static final List<String> COLUMNAS_SINIESTRO = List.of("fecha", "anio", "mes", "dia_semana", "hora", "franja",
            "provincia", "canton", "distrito", "ruta", "km", "lat", "lon", "tipo_vehiculo", "severidad", "clima",
            "calzada", "tiempo_respuesta_min", "tipo_accidente", "tipo_ruta", "zona");
    private static final List<String> COLUMNAS_VICTIMA = List.of("edad", "genero", "condicion", "anio", "mes",
            "dia_semana", "provincia", "canton", "distrito", "rol", "tipo_lesion", "vehiculo", "edad_quinquenal");
    /** Columnas SMALLINT; edad es INTEGER; el resto de los números son DOUBLE PRECISION. */
    private static final Set<String> CORTAS = Set.of("anio", "mes", "hora");

    private static final Map<RecordKind, String> INSERT = Map.of(
            RecordKind.SINISTER, insertar("sinister", "sinister_seq", COLUMNAS_SINIESTRO),
            RecordKind.VICTIM, insertar("victim", "victim_seq", COLUMNAS_VICTIMA));

    private final JdbcTemplate jdbc;

    public JdbcRecordRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public NormalizedRecord save(NormalizedRecord registro) {
        saveAll(List.of(registro));
        return registro;
    }

    @Override
    @Transactional
    public List<NormalizedRecord> saveAll(Collection<NormalizedRecord> registros) {
        // un lote suele ser de un solo tipo (un archivo = un perfil), pero se agrupa por si no lo fuera
        registros.stream().collect(Collectors.groupingBy(NormalizedRecord::tipo)).forEach((tipo, grupo) -> {
            List<String> columnas = tipo == RecordKind.SINISTER ? COLUMNAS_SINIESTRO : COLUMNAS_VICTIMA;
            List<Object[]> filas = new ArrayList<>(grupo.size());
            for (NormalizedRecord r : grupo) {
                Object[] fila = new Object[columnas.size() + 2];
                fila[0] = r.ingestionLogId();
                fila[1] = r.calidad().name();
                for (int i = 0; i < columnas.size(); i++) {
                    fila[i + 2] = valor(columnas.get(i), r.campos().get(columnas.get(i)));
                }
                filas.add(fila);
            }
            jdbc.batchUpdate(INSERT.get(tipo), filas);
        });
        return List.copyOf(registros);
    }

    @Override
    public long count() {
        return jdbc.queryForObject("SELECT (SELECT count(*) FROM sinister) + (SELECT count(*) FROM victim)", Long.class);
    }

    @Override
    public void deleteByIngestionLogId(long ingestionLogId) {
        jdbc.update("DELETE FROM victim WHERE ingestion_log_id = ?", ingestionLogId);
        jdbc.update("DELETE FROM sinister WHERE ingestion_log_id = ?", ingestionLogId);
    }

    private static String insertar(String tabla, String secuencia, List<String> columnas) {
        return "INSERT INTO " + tabla + " (id, ingestion_log_id, calidad, " + String.join(", ", columnas)
                + ") VALUES (nextval('" + secuencia + "'), ?, ?" + ", ?".repeat(columnas.size()) + ")";
    }

    /** Ausente = null. Fecha -> Timestamp; números según la columna; todo lo demás, texto. */
    private static Object valor(String columna, Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDateTime fecha) {
            return Timestamp.valueOf(fecha);
        }
        if (v instanceof Number n) {
            if (CORTAS.contains(columna)) {
                return n.shortValue();
            }
            if (columna.equals("edad")) {
                return n.intValue();
            }
            return n.doubleValue();
        }
        return v.toString();
    }
}
