package app.persistence;

import static model.Claves.norm;
import static model.Claves.severidad;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import model.DashboardRepository;
import model.StatsRepository.Celda;
import model.StatsRepository.Conteo;
import model.StatsRepository.Lesiones;
import model.StatsRepository.Resumen;
import model.dto.DashboardFilters;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Agregaciones del panel del dashboard sobre sinister y victim con DashboardFilters (varios valores por filtro, etiquetas
 * del frontend). Solo registros VALIDO y, en siniestros, de la fuente de los KPI (ver Filtros). Devuelve conteos: nunca
 * filas ni datos que identifiquen a una persona. Los valores del usuario siempre van como parámetros; el SQL solo lleva
 * constantes de esta clase.
 *
 * Las comparaciones de texto (provincia, cantón, distrito, día, franja, clima, calzada) se hacen sobre el valor
 * normalizado (sin tildes, en mayúsculas, con "_" en lugar de espacios), así "San José" del frontend y SAN_JOSE de la
 * base coinciden.
 */
@Repository
public class JdbcDashboardRepository implements DashboardRepository {

    /** Rutas nacionales: solo dígitos. Excluye "Cantonal" e "Ignorada", que no son una ruta. */
    private static final String RUTA_NACIONAL = " AND s.ruta ~ '^[0-9]+$'";

    /**
     * Rango de edad de una persona, con los rangos que muestra el frontend; las edades fuera de ellos (menores de 18 o
     * sin edad) no caen en ninguno y el perfil no las cuenta.
     */
    private static final String EDAD_RANGO =
        "CASE "
      + "WHEN v.edad BETWEEN 18 AND 25 THEN '18-25' "
      + "WHEN v.edad BETWEEN 26 AND 40 THEN '26-40' "
      + "WHEN v.edad BETWEEN 41 AND 60 THEN '41-60' "
      + "WHEN v.edad > 60 THEN '>60' "
      + "END";

    /** WHERE (sin la palabra WHERE) y sus parámetros. */
    private record Clausula(String sql, MapSqlParameterSource p) { }

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcDashboardRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------------------------------------ siniestros

    @Override
    public long contarSiniestros(DashboardFilters f, Set<String> ignorar) {
        Clausula c = siniestros(f, ignorar);
        Long n = jdbc.queryForObject("SELECT count(*) FROM sinister s WHERE " + c.sql(), c.p(), Long.class);
        return n == null ? 0 : n;
    }

    @Override
    public Resumen resumenSiniestros(DashboardFilters f, Set<String> climaAdverso, Set<String> calzadaAdversa) {
        Clausula c = siniestros(f, Set.of());
        // IN () vacío no es SQL válido: sin valores adversos configurados, la condición es falsa
        List<String> adversos = new ArrayList<>();
        if (!climaAdverso.isEmpty()) {
            adversos.add("s.clima IN (:climaAdverso)");
            c.p().addValue("climaAdverso", List.copyOf(climaAdverso));
        }
        if (!calzadaAdversa.isEmpty()) {
            adversos.add("s.calzada IN (:calzadaAdversa)");
            c.p().addValue("calzadaAdversa", List.copyOf(calzadaAdversa));
        }
        String esAdverso = adversos.isEmpty() ? "FALSE" : String.join(" OR ", adversos);
        return jdbc.queryForObject(
            "SELECT count(*) AS total, count(s.tiempo_respuesta_min) AS con_tiempo, "
          + "COALESCE(sum(s.tiempo_respuesta_min), 0) AS suma_tiempo, "
          + "count(*) FILTER (WHERE " + esAdverso + ") AS adversos "
          + "FROM sinister s WHERE " + c.sql(),
            c.p(),
            (rs, fila) -> new Resumen(rs.getLong("total"), rs.getLong("con_tiempo"), rs.getDouble("suma_tiempo"),
                rs.getLong("adversos")));
    }

    @Override
    public List<Conteo> siniestrosPor(Columna columna, DashboardFilters f, Set<String> ignorar) {
        Clausula c = siniestros(f, ignorar);
        String col = "s." + columna.sql;
        return jdbc.query(
            "SELECT " + col + ", count(*) FROM sinister s WHERE " + c.sql() + " AND " + col + " IS NOT NULL "
          + "GROUP BY 1 ORDER BY 1",
            c.p(), (rs, fila) -> new Conteo(rs.getString(1), rs.getLong(2)));
    }

    @Override
    public List<Conteo> siniestrosPorRuta(DashboardFilters f) {
        Clausula c = siniestros(f, Set.of(RUTA));
        return jdbc.query(
            "SELECT s.ruta, count(*) FROM sinister s WHERE " + c.sql() + RUTA_NACIONAL
          + " GROUP BY 1 ORDER BY 2 DESC, 1",
            c.p(), (rs, fila) -> new Conteo(rs.getString(1), rs.getLong(2)));
    }

    @Override
    public List<Celda> siniestrosPorDiaYFranja(DashboardFilters f) {
        Clausula c = siniestros(f, Set.of());
        return jdbc.query(
            "SELECT s.dia_semana, s.franja, count(*) FROM sinister s WHERE " + c.sql() + " GROUP BY 1, 2",
            c.p(), (rs, fila) -> new Celda(rs.getString(1), rs.getString(2), rs.getLong(3)));
    }

    // ------------------------------------------------------------------------------------------------ catálogos

    private static final String SINIESTROS_DEL_KPI =
        "s.calidad = 'VALIDO' AND s.ingestion_log_id IN (SELECT id FROM ingestion_log WHERE fuente = :fuenteKpi)";

    @Override
    public List<Ubicacion> ubicaciones() {
        return jdbc.query(
            "SELECT DISTINCT s.provincia, s.canton, s.distrito FROM sinister s WHERE " + SINIESTROS_DEL_KPI
          + " AND s.provincia IS NOT NULL AND btrim(s.canton) <> '' AND btrim(s.distrito) <> ''",
            fuente(), (rs, fila) -> new Ubicacion(rs.getString(1), rs.getString(2), rs.getString(3)));
    }

    @Override
    public List<String> rutasNacionales() {
        return jdbc.queryForList(
            "SELECT s.ruta FROM sinister s WHERE " + SINIESTROS_DEL_KPI + RUTA_NACIONAL
          + " GROUP BY s.ruta ORDER BY length(s.ruta), s.ruta",
            fuente(), String.class);
    }

    @Override
    public List<Integer> anios() {
        return jdbc.queryForList(
            "SELECT DISTINCT s.anio FROM sinister s WHERE " + SINIESTROS_DEL_KPI + " AND s.anio IS NOT NULL ORDER BY 1",
            fuente(), Integer.class);
    }

    @Override
    public List<String> vehiculos() {
        return jdbc.queryForList(
            "SELECT DISTINCT btrim(v.vehiculo) FROM victim v WHERE v.calidad = 'VALIDO' AND btrim(v.vehiculo) <> '' "
          + "AND upper(btrim(v.vehiculo)) <> 'NO APLICA' ORDER BY 1",
            new MapSqlParameterSource(), String.class);
    }

    private static MapSqlParameterSource fuente() {
        return new MapSqlParameterSource("fuenteKpi", Filtros.FUENTE_DE_KPI);
    }

    /**
     * Siniestros VALIDO de la fuente de KPI con los filtros de siniestros, menos los que se nombran en ignorar. Los
     * filtros de personas (vehículo, edad, género) no existen en siniestros y no se aplican aquí.
     */
    private Clausula siniestros(DashboardFilters f, Set<String> ignorar) {
        List<String> condiciones = new ArrayList<>();
        condiciones.add("s.calidad = 'VALIDO'");
        condiciones.add("s.ingestion_log_id IN (SELECT id FROM ingestion_log WHERE fuente = :fuenteKpi)");
        MapSqlParameterSource p = new MapSqlParameterSource("fuenteKpi", Filtros.FUENTE_DE_KPI);

        texto(condiciones, p, ignorar, PROVINCIA, "s.provincia", f.provincia());
        texto(condiciones, p, ignorar, CANTON, "s.canton", f.canton());
        texto(condiciones, p, ignorar, DISTRITO, "s.distrito", f.distrito());

        if (!ignorar.contains(RUTA) && hay(f.ruta())) {
            // "Ruta 27" del frontend -> 27, que es como se guarda
            condiciones.add("s.ruta = :ruta");
            p.addValue("ruta", norm(f.ruta()).replaceFirst("^RUTA_", ""));
        }

        lista(condiciones, p, ignorar, ANIOS, "s.anio", f.anios());
        lista(condiciones, p, ignorar, MESES, "s.mes", f.meses());
        lista(condiciones, p, ignorar, DIAS, "s.dia_semana", normalizados(f.dias()));
        lista(condiciones, p, ignorar, FRANJAS, "s.franja", normalizados(f.franjas()));
        lista(condiciones, p, ignorar, CLIMAS, "s.clima", normalizados(f.climas()));
        lista(condiciones, p, ignorar, CALZADAS, "s.calzada", normalizados(f.calzadas()));

        if (!ignorar.contains(SEVERIDADES) && !f.severidades().isEmpty()) {
            condiciones.add("s.severidad IN (:severidades)");
            p.addValue("severidades", f.severidades().stream().map(m -> severidad(m)).distinct().toList());
        }
        return new Clausula(String.join(" AND ", condiciones), p);
    }

    // ------------------------------------------------------------------------------------------------ personas

    @Override
    public Lesiones personasPorLesion(DashboardFilters f, boolean soloComunes) {
        Clausula c = personas(f, soloComunes, false);
        c.p().addValue("fallecido", JdbcStatsRepository.LESION_FALLECIDO)
            .addValue("grave", JdbcStatsRepository.LESION_GRAVE)
            .addValue("leve", JdbcStatsRepository.LESION_LEVE);
        return jdbc.queryForObject(
            "SELECT count(*) AS personas, "
          + "count(*) FILTER (WHERE v.tipo_lesion = :fallecido) AS fallecidos, "
          + "count(*) FILTER (WHERE v.tipo_lesion = :grave) AS graves, "
          + "count(*) FILTER (WHERE v.tipo_lesion = :leve) AS leves FROM victim v WHERE " + c.sql(),
            c.p(),
            (rs, fila) -> new Lesiones(rs.getLong("personas"), rs.getLong("fallecidos"), rs.getLong("graves"),
                rs.getLong("leves")));
    }

    @Override
    public List<PersonasPorVehiculo> personasPorVehiculo(DashboardFilters f) {
        Clausula c = personas(f, false, true);
        // peatones aparte; el resto por el texto de COSEVI "vehículo en el que viajaba" (igual que el perfil de víctimas)
        c.p().addValue("rolPeaton", JdbcVictimRepository.ROL_PEATON)
            .addValue("etiquetaPeaton", JdbcVictimRepository.GRUPO_PEATON)
            .addValue("sinDato", JdbcVictimRepository.GRUPO_SIN_DATO)
            .addValue("lesionMortal", JdbcVictimRepository.LESION_MORTAL);
        return jdbc.query(
            "SELECT CASE WHEN v.rol = :rolPeaton THEN CAST(:etiquetaPeaton AS text) "
          + "ELSE COALESCE(NULLIF(btrim(v.vehiculo), ''), CAST(:sinDato AS text)) END AS grupo, "
          + "count(*) AS personas, count(*) FILTER (WHERE v.tipo_lesion = :lesionMortal) AS fallecidos "
          + "FROM victim v WHERE " + c.sql() + " GROUP BY 1",
            c.p(),
            (rs, fila) -> new PersonasPorVehiculo(rs.getString("grupo"), rs.getLong("personas"),
                rs.getLong("fallecidos")));
    }

    @Override
    public List<PersonasPorEdadYGenero> personasPorEdadYGenero(DashboardFilters f) {
        Clausula c = personas(f, false, false);
        return jdbc.query(
            "SELECT " + EDAD_RANGO + " AS rango, upper(v.genero) AS genero, count(*) AS personas "
          + "FROM victim v WHERE " + c.sql() + " AND " + EDAD_RANGO + " IS NOT NULL GROUP BY 1, 2",
            c.p(),
            (rs, fila) -> new PersonasPorEdadYGenero(rs.getString("rango"), rs.getString("genero"),
                rs.getLong("personas")));
    }

    /**
     * Personas VALIDO con los filtros que existen en victim: ubicación y tiempo siempre; vehículo, edad y género salvo
     * que soloComunes lo impida (el vehículo también se puede ignorar solo, para su propio gráfico).
     */
    private Clausula personas(DashboardFilters f, boolean soloComunes, boolean ignorarVehiculo) {
        List<String> condiciones = new ArrayList<>();
        condiciones.add("v.calidad = 'VALIDO'");
        MapSqlParameterSource p = new MapSqlParameterSource();

        texto(condiciones, p, Set.of(), PROVINCIA, "v.provincia", f.provincia());
        texto(condiciones, p, Set.of(), CANTON, "v.canton", f.canton());
        texto(condiciones, p, Set.of(), DISTRITO, "v.distrito", f.distrito());
        lista(condiciones, p, Set.of(), ANIOS, "v.anio", f.anios());
        lista(condiciones, p, Set.of(), MESES, "v.mes", f.meses());
        lista(condiciones, p, Set.of(), DIAS, "v.dia_semana", normalizados(f.dias()));

        if (!soloComunes) {
            if (!f.edades().isEmpty()) {
                condiciones.add(EDAD_RANGO + " IN (:edades)");
                p.addValue("edades", f.edades());
            }
            if (!f.generos().isEmpty()) {
                condiciones.add("upper(v.genero) IN (:generos)");
                p.addValue("generos", normalizados(f.generos()));
            }
            if (!ignorarVehiculo && !f.vehiculos().isEmpty()) {
                condiciones.add("v.vehiculo IN (:vehiculos)");
                p.addValue("vehiculos", f.vehiculos());
            }
        }
        return new Clausula(String.join(" AND ", condiciones), p);
    }

    // ------------------------------------------------------------------------------------------------ apoyo

    /** Comparación de texto sin tildes ni mayúsculas, equivalente a Claves.norm. */
    private static String sqlNorm(String columna) {
        return "upper(translate(" + columna + ", 'áéíóúÁÉÍÓÚñÑ ', 'aeiouAEIOUnN_'))";
    }

    private static void texto(List<String> condiciones, MapSqlParameterSource p, Set<String> ignorar, String clave,
                              String columna, String valor) {
        if (!ignorar.contains(clave) && hay(valor)) {
            condiciones.add(sqlNorm(columna) + " = :" + clave);
            p.addValue(clave, norm(valor));
        }
    }

    private static <T> void lista(List<String> condiciones, MapSqlParameterSource p, Set<String> ignorar, String clave,
                                  String columna, List<T> valores) {
        if (ignorar.contains(clave) || valores.isEmpty()) {
            return;
        }
        condiciones.add(columna + " IN (:" + clave + ")");
        p.addValue(clave, valores);
    }

    private static List<String> normalizados(List<String> valores) {
        return valores.stream().map(v -> norm(v)).toList();
    }

    private static boolean hay(String s) {
        return s != null && !s.isBlank();
    }
}
