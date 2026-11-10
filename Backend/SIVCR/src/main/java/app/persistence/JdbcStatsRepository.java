package app.persistence;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import model.FilterCriteria;
import model.StatsRepository;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Agregaciones del dashboard sobre sinister y victim. Solo registros VALIDO y, en siniestros, de la fuente de los KPI
 * (ver Filtros). Devuelve conteos: nunca filas ni datos que identifiquen a una persona. Los valores del usuario siempre
 * van como parámetros; el SQL solo lleva constantes de esta clase.
 */
@Repository
public class JdbcStatsRepository implements StatsRepository {

    /** Valores normalizados de victim.tipo_lesion (perfil cosevi-personas). */
    static final String LESION_FALLECIDO = JdbcVictimRepository.LESION_MORTAL;
    static final String LESION_GRAVE = "HERIDO_GRAVE";
    static final String LESION_LEVE = "HERIDO_LEVE";

    /** Rutas nacionales: solo dígitos. Excluye "Cantonal" e "Ignorada", que no son una ruta. */
    private static final String RUTA_NACIONAL = " AND ruta ~ '^[0-9]+$'";

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcStatsRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Resumen resumen(FilterCriteria c, Set<String> climaAdverso, Set<String> calzadaAdversa) {
        Filtros.Consulta q = Filtros.siniestrosParaKpi(c, Alcance.COMPLETO);
        // IN () vacío no es SQL válido: sin valores adversos configurados, la condición es falsa
        List<String> adversos = new ArrayList<>();
        if (!climaAdverso.isEmpty()) {
            adversos.add("clima IN (:climaAdverso)");
            q.parametros().addValue("climaAdverso", List.copyOf(climaAdverso));
        }
        if (!calzadaAdversa.isEmpty()) {
            adversos.add("calzada IN (:calzadaAdversa)");
            q.parametros().addValue("calzadaAdversa", List.copyOf(calzadaAdversa));
        }
        String esAdverso = adversos.isEmpty() ? "FALSE" : String.join(" OR ", adversos);
        return jdbc.queryForObject(
            "SELECT count(*) AS total, count(tiempo_respuesta_min) AS con_tiempo, "
          + "COALESCE(sum(tiempo_respuesta_min), 0) AS suma_tiempo, "
          + "count(*) FILTER (WHERE " + esAdverso + ") AS adversos FROM sinister" + q.where(),
            q.parametros(),
            (rs, fila) -> new Resumen(rs.getLong("total"), rs.getLong("con_tiempo"), rs.getDouble("suma_tiempo"),
                rs.getLong("adversos")));
    }

    @Override
    public long contar(FilterCriteria c, Alcance alcance) {
        Filtros.Consulta q = Filtros.siniestrosParaKpi(c, alcance);
        Long total = jdbc.queryForObject("SELECT count(*) FROM sinister" + q.where(), q.parametros(), Long.class);
        return total == null ? 0 : total;
    }

    @Override
    public List<Conteo> porProvincia(FilterCriteria c) {
        Filtros.Consulta q = Filtros.siniestrosParaKpi(c, Alcance.SIN_GEOGRAFIA);
        return conteos("SELECT provincia AS clave, count(*) AS n FROM sinister" + q.where()
            + " AND provincia IS NOT NULL GROUP BY provincia ORDER BY n DESC, provincia", q.parametros());
    }

    @Override
    public List<Conteo> porRuta(FilterCriteria c, Alcance alcance) {
        Filtros.Consulta q = Filtros.siniestrosParaKpi(c, alcance);
        // desempate por longitud y luego texto: 2 antes que 10 sin convertir a número
        return conteos("SELECT ruta AS clave, count(*) AS n FROM sinister" + q.where() + RUTA_NACIONAL
            + " GROUP BY ruta ORDER BY n DESC, length(ruta), ruta", q.parametros());
    }

    @Override
    public List<Celda> mapaDeCalor(FilterCriteria c) {
        Filtros.Consulta q = Filtros.siniestrosParaKpi(c, Alcance.COMPLETO);
        return jdbc.query(
            "SELECT dia_semana, franja, count(*) AS n FROM sinister" + q.where()
          + " AND dia_semana IS NOT NULL AND franja IS NOT NULL GROUP BY dia_semana, franja",
            q.parametros(),
            (rs, fila) -> new Celda(rs.getString("dia_semana"), rs.getString("franja"), rs.getLong("n")));
    }

    @Override
    public List<Conteo> porAnio(FilterCriteria c) {
        Filtros.Consulta q = Filtros.siniestrosParaKpi(c, Alcance.COMPLETO);
        return conteos("SELECT CAST(anio AS text) AS clave, count(*) AS n FROM sinister" + q.where()
            + " AND anio IS NOT NULL GROUP BY anio ORDER BY anio", q.parametros());
    }

    @Override
    public Lesiones lesiones(FilterCriteria c) {
        Filtros.Consulta q = Filtros.personasSinEdadNiGenero(c);
        q.parametros().addValue("fallecido", LESION_FALLECIDO)
            .addValue("grave", LESION_GRAVE)
            .addValue("leve", LESION_LEVE);
        return jdbc.queryForObject(
            "SELECT count(*) AS personas, "
          + "count(*) FILTER (WHERE tipo_lesion = :fallecido) AS fallecidos, "
          + "count(*) FILTER (WHERE tipo_lesion = :grave) AS graves, "
          + "count(*) FILTER (WHERE tipo_lesion = :leve) AS leves FROM victim" + q.where(),
            q.parametros(),
            (rs, fila) -> new Lesiones(rs.getLong("personas"), rs.getLong("fallecidos"), rs.getLong("graves"),
                rs.getLong("leves")));
    }

    private List<Conteo> conteos(String sql, MapSqlParameterSource parametros) {
        return jdbc.query(sql, parametros, (rs, fila) -> new Conteo(rs.getString("clave"), rs.getLong("n")));
    }
}
