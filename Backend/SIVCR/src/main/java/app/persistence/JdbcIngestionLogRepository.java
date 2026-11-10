package app.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import enums.DataSource;
import enums.LoadResult;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import model.ingestion.IngestionLog;
import model.ingestion.IngestionLogRepository;
import model.ingestion.QualityCounts;
import model.ingestion.QualityReport;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Cargas (tabla ingestion_log) y su reporte de calidad (tabla quality_report, una fila por carga; errores en JSONB). */
@Repository
public class JdbcIngestionLogRepository implements IngestionLogRepository {

    private static final ObjectMapper JSON = new ObjectMapper();

    // el usuario sale de app_user (usuario_id es clave foránea) y los conteos del reporte, si ya existe
    private static final String SELECT = "SELECT l.id, l.fecha, l.fuente, l.resultado, l.usuario_id, u.name, "
            + "l.nombre_archivo, l.perfil, l.mensaje, l.checksum, q.validos, q.incompletos, q.corruptos, q.omitidos "
            + "FROM ingestion_log l JOIN app_user u ON u.id = l.usuario_id "
            + "LEFT JOIN quality_report q ON q.ingestion_log_id = l.id ";

    private final JdbcTemplate jdbc;

    public JdbcIngestionLogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public IngestionLog save(IngestionLog l) {
        Object[] datos = {Timestamp.valueOf(l.fecha()), l.fuente().name(), l.archivo(), l.resultado().name(),
                l.mensaje(), l.usuarioId(), l.checksum(), l.perfil()};
        if (l.id() == null) {
            Long id = jdbc.queryForObject("INSERT INTO ingestion_log (fecha, fuente, nombre_archivo, resultado, mensaje, "
                    + "usuario_id, checksum, perfil) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id", Long.class, datos);
            return l.conId(id);
        }
        Object[] conId = Arrays.copyOf(datos, datos.length + 1);
        conId[datos.length] = l.id();
        jdbc.update("UPDATE ingestion_log SET fecha = ?, fuente = ?, nombre_archivo = ?, resultado = ?, mensaje = ?, "
                + "usuario_id = ?, checksum = ?, perfil = ? WHERE id = ?", conId);
        return l;
    }

    @Override
    public List<IngestionLog> saveAll(Collection<IngestionLog> cargas) {
        List<IngestionLog> guardadas = new ArrayList<>();
        cargas.forEach(c -> guardadas.add(save(c)));
        return guardadas;
    }

    @Override
    public long count() {
        return jdbc.queryForObject("SELECT count(*) FROM ingestion_log", Long.class);
    }

    @Override
    public Optional<IngestionLog> findById(long id) {
        return jdbc.query(SELECT + "WHERE l.id = ?", this::carga, id).stream().findFirst();
    }

    @Override
    public Optional<IngestionLog> findCargaPreviaPorChecksum(String checksum) {
        return jdbc.query(SELECT + "WHERE l.checksum = ? AND l.resultado IN ('" + LoadResult.EXITOSA + "', '"
                + LoadResult.PARCIAL + "') ORDER BY l.fecha DESC, l.id DESC LIMIT 1", this::carga, checksum)
                .stream().findFirst();
    }

    @Override
    public List<IngestionLog> findAllPorFechaDesc() {
        return jdbc.query(SELECT + "ORDER BY l.fecha DESC, l.id DESC", this::carga);
    }

    @Override
    public QualityReport guardarReporte(QualityReport r) {
        jdbc.update("INSERT INTO quality_report (ingestion_log_id, validos, incompletos, corruptos, omitidos, errores) "
                + "VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb)) ON CONFLICT (ingestion_log_id) DO UPDATE SET "
                + "validos = EXCLUDED.validos, incompletos = EXCLUDED.incompletos, corruptos = EXCLUDED.corruptos, "
                + "omitidos = EXCLUDED.omitidos, errores = EXCLUDED.errores",
                r.idCarga(), r.validos(), r.incompletos(), r.corruptos(), r.omitidos(), aJson(r.errores()));
        return r;
    }

    @Override
    public Optional<QualityReport> findReporte(long idCarga) {
        return jdbc.query("SELECT validos, incompletos, corruptos, omitidos, CAST(errores AS text) AS errores "
                + "FROM quality_report WHERE ingestion_log_id = ?",
                (rs, n) -> new QualityReport(idCarga, rs.getInt("validos"), rs.getInt("incompletos"),
                        rs.getInt("corruptos"), rs.getInt("omitidos"), erroresDe(rs.getString("errores"))),
                idCarga).stream().findFirst();
    }

    private IngestionLog carga(ResultSet rs, int fila) throws SQLException {
        QualityCounts conteos = rs.getObject("validos") == null ? null
                : new QualityCounts(rs.getInt("validos"), rs.getInt("incompletos"), rs.getInt("corruptos"),
                        rs.getInt("omitidos"));
        return new IngestionLog(rs.getLong("id"), rs.getTimestamp("fecha").toLocalDateTime(),
                DataSource.valueOf(rs.getString("fuente")), LoadResult.valueOf(rs.getString("resultado")),
                rs.getLong("usuario_id"), rs.getString("name"), rs.getString("nombre_archivo"), rs.getString("perfil"),
                rs.getString("mensaje"), rs.getString("checksum"), conteos);
    }

    private static String aJson(List<String> errores) {
        try {
            return JSON.writeValueAsString(errores);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo convertir la lista de errores a JSON", e);
        }
    }

    private static List<String> erroresDe(String json) {
        try {
            return JSON.readValue(json, new TypeReference<List<String>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("La lista de errores guardada no se puede leer", e);
        }
    }
}
