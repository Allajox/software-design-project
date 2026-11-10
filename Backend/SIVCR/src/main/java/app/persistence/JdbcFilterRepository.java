package app.persistence;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import model.FilterCriteria;
import model.FilterRepository;
import model.QueryHistory;
import model.SavedFilter;
import model.SivcrException;
import model.SivcrException.Tipo;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Filtros guardados (tabla saved_filter, HU 22) e historial de consultas (tabla query_history, HU 23).
 * En ambas tablas los criterios se guardan como JSONB.
 */
@Repository
public class JdbcFilterRepository implements FilterRepository {

    private static final String RESTRICCION_NOMBRE = "uq_saved_filter_nombre";

    // Solo se escriben los criterios que el usuario llenó; el resto queda ausente (= sin filtro)
    private static final ObjectMapper JSON = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);

    private static final String SELECCIONAR_HISTORIAL =
            "SELECT id, fecha, resumen, CAST(criteria AS text) AS criteria FROM query_history";

    private static final RowMapper<SavedFilter> FILTRO = (rs, i) -> new SavedFilter(
            rs.getLong("id"),
            rs.getString("nombre"),
            desdeJson(rs.getString("criteria")),
            rs.getTimestamp("creado_en").toLocalDateTime());

    private static final RowMapper<QueryHistory> CONSULTA = (rs, i) -> new QueryHistory(
            rs.getLong("id"),
            rs.getTimestamp("fecha").toLocalDateTime(),
            rs.getString("resumen"),
            desdeJson(rs.getString("criteria")));

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcFilterRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---- Filtros guardados (HU 22) ----

    @Override
    public SavedFilter guardar(long usuarioId, String nombre, FilterCriteria criterio) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("usuario", usuarioId)
                .addValue("nombre", nombre)
                .addValue("criteria", aJson(criterio));
        try {
            return jdbc.queryForObject(
                    "INSERT INTO saved_filter (usuario_id, nombre, criteria) "
                  + "VALUES (:usuario, :nombre, CAST(:criteria AS jsonb)) RETURNING id, creado_en",
                    p,
                    (rs, fila) -> new SavedFilter(rs.getLong("id"), nombre, criterio,
                            rs.getTimestamp("creado_en").toLocalDateTime()));
        } catch (DataIntegrityViolationException e) {
            // el mismo usuario ya tiene un filtro con ese nombre (restricción única usuario_id + nombre)
            String detalle = String.valueOf(e.getMessage());
            if (e instanceof DuplicateKeyException || detalle.contains(RESTRICCION_NOMBRE)) {
                throw new SivcrException(Tipo.CONFLICTO, "Ya tienes un filtro guardado con el nombre \"" + nombre + "\".");
            }
            throw e;
        }
    }

    @Override
    public List<SavedFilter> listar(long usuarioId) {
        return jdbc.query(
                "SELECT id, nombre, CAST(criteria AS text) AS criteria, creado_en FROM saved_filter "
              + "WHERE usuario_id = :usuario ORDER BY creado_en DESC, id DESC",
                new MapSqlParameterSource("usuario", usuarioId),
                FILTRO);
    }

    // ---- Historial de consultas (HU 23) ----

    @Override
    public void registrar(long usuarioId, String resumen, FilterCriteria criterio) {
        jdbc.update(
                "INSERT INTO query_history (usuario_id, resumen, criteria) "
              + "VALUES (:usuario, :resumen, CAST(:criteria AS jsonb))",
                new MapSqlParameterSource()
                        .addValue("usuario", usuarioId)
                        .addValue("resumen", resumen)
                        .addValue("criteria", aJson(criterio)));
    }

    @Override
    public List<QueryHistory> recientes(long usuarioId, int limite) {
        return jdbc.query(
                SELECCIONAR_HISTORIAL + " WHERE usuario_id = :usuario ORDER BY fecha DESC, id DESC LIMIT :limite",
                new MapSqlParameterSource().addValue("usuario", usuarioId).addValue("limite", limite),
                CONSULTA);
    }

    @Override
    public Optional<QueryHistory> buscar(long usuarioId, long id) {
        return jdbc.query(
                SELECCIONAR_HISTORIAL + " WHERE usuario_id = :usuario AND id = :id",
                new MapSqlParameterSource().addValue("usuario", usuarioId).addValue("id", id),
                CONSULTA).stream().findFirst();
    }

    // ---- criterios <-> JSON ----

    private static String aJson(FilterCriteria criterio) {
        try {
            return JSON.writeValueAsString(criterio);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo convertir el filtro a JSON", e);
        }
    }

    private static FilterCriteria desdeJson(String json) {
        try {
            return JSON.readValue(json, FilterCriteria.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("El filtro guardado tiene un formato que no se puede leer", e);
        }
    }
}
