package app.persistence;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import model.ConfigStore;
import model.SystemConfig;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Lee y guarda la configuración del sistema: la única fila de system_config (id = 1). */
@Repository
public class JdbcConfigRepository implements ConfigStore {

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcConfigRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public SystemConfig leer() {
        return jdbc.query(
            "SELECT w_fallecido, w_herido_grave, w_herido_leve, clima_adverso, calzada_adversa "
          + "FROM system_config WHERE id = 1", Map.of(),
            (rs, fila) -> new SystemConfig(rs.getDouble("w_fallecido"), rs.getDouble("w_herido_grave"),
                rs.getDouble("w_herido_leve"), valores(rs, "clima_adverso"), valores(rs, "calzada_adversa")))
            .stream().findFirst().orElseGet(SystemConfig::porOmision);
    }

    /** Upsert de la fila única: si alguien la borró, la vuelve a crear en vez de fallar sin avisar. */
    @Override
    public void guardar(SystemConfig c, long usuarioId) {
        jdbc.update(
            "INSERT INTO system_config (id, w_fallecido, w_herido_grave, w_herido_leve, clima_adverso, calzada_adversa, "
          + "actualizado_en, actualizado_por) "
          + "VALUES (1, :w1, :w2, :w3, :clima, :calzada, now(), :usuario) "
          + "ON CONFLICT (id) DO UPDATE SET w_fallecido = EXCLUDED.w_fallecido, "
          + "w_herido_grave = EXCLUDED.w_herido_grave, w_herido_leve = EXCLUDED.w_herido_leve, "
          + "clima_adverso = EXCLUDED.clima_adverso, calzada_adversa = EXCLUDED.calzada_adversa, "
          + "actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por",
            new MapSqlParameterSource()
                .addValue("w1", c.wFallecido())
                .addValue("w2", c.wHeridoGrave())
                .addValue("w3", c.wHeridoLeve())
                .addValue("clima", ordenados(c.climaAdverso()))
                .addValue("calzada", ordenados(c.calzadaAdversa()))
                .addValue("usuario", usuarioId));
    }

    private static String[] ordenados(Set<String> valores) {
        return valores.stream().sorted().toArray(String[]::new);
    }

    private static Set<String> valores(ResultSet rs, String columna) throws SQLException {
        Array arreglo = rs.getArray(columna);
        return arreglo == null ? Set.of() : new LinkedHashSet<>(Arrays.asList((String[]) arreglo.getArray()));
    }
}
