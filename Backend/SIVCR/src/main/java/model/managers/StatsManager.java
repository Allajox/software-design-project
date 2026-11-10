package model.managers;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.UnaryOperator;

import model.dto.DashboardCharts;
import model.dto.DashboardCharts.ItemConteo;
import model.dto.DashboardCharts.ItemRuta;
import model.dto.DashboardCharts.ItemVehiculo;
import model.dto.DashboardCharts.Kpis;
import model.dto.DashboardCharts.MatrizDiaFranja;
import model.dto.DashboardCharts.PerfilDemografico;
import model.dto.DashboardFilters;
import model.dto.PublicSummary;

import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class StatsManager {

    private static final List<String> PROVINCIAS = List.of(
            "San José", "Alajuela", "Cartago", "Heredia",
            "Guanacaste", "Puntarenas", "Limón"
    );

    private static final List<String> DIAS = List.of(
            "Lunes", "Martes", "Miércoles", "Jueves",
            "Viernes", "Sábado", "Domingo"
    );

    private static final List<String> FRANJAS = List.of(
            "Madrugada", "Mañana", "Tarde", "Noche"
    );

    /*
     * Categorías reales almacenadas en sinister.severidad.
     * No representan cantidades individuales de personas fallecidas o heridas.
     */
    private static final List<String> SEVERIDADES = List.of(
            "Fallecido",
            "Con muertos o graves",
            "Solo heridos leves"
    );

    private static final List<String> EDADES_PIRAMIDE = List.of(
            ">60", "41-60", "26-40", "18-25"
    );

    private static final Set<String> UBICACION = Set.of(
            "provincia", "canton", "distrito", "ruta"
    );

    

    private static final String EDAD_RANGO =
            "CASE "
            + "WHEN v.edad BETWEEN 18 AND 25 THEN '18-25' "
            + "WHEN v.edad BETWEEN 26 AND 40 THEN '26-40' "
            + "WHEN v.edad BETWEEN 41 AND 60 THEN '41-60' "
            + "WHEN v.edad > 60 THEN '>60' "
            + "END";

    private record Clausula(String sql, MapSqlParameterSource p) {}

    private record Fila(String k, long n) {}

    private final NamedParameterJdbcTemplate jdbc;

    public StatsManager(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ================================================================
    // Dashboard
    // ================================================================

    public DashboardCharts dashboard(DashboardFilters f) {

        Clausula todas = donde(f, Set.of());
        Clausula nacional = donde(f, UBICACION);

        Clausula filtrosVictimas = dondeVictimas(f, false);

        return new DashboardCharts(
                kpis(todas, nacional, filtrosVictimas),
                provincias(nacional),
                vehiculos(dondeVictimas(f, true)),   // ignora su propio filtro
                severidades(donde(f, Set.of("severidades"))),
                rutas(donde(f, Set.of("ruta"))),
                matriz(todas),
                perfil(filtrosVictimas)
        );
    }

    // ================================================================
    // KPIs
    // ================================================================

    private Kpis kpis(
            Clausula todas,
            Clausula nacional,
            Clausula filtrosVictimas) {

        long total = contar(new Clausula(
                "s.calidad = 'VALIDO'",
                new MapSqlParameterSource()
        ));

        long nac = contar(nacional);

        Map<String, Object> pesos = jdbc.getJdbcTemplate().queryForMap(
                "SELECT w_fallecido, w_herido_grave, w_herido_leve "
                + "FROM system_config WHERE id = 1"
        );

        double w1 = num(pesos.get("w_fallecido"));
        double w2 = num(pesos.get("w_herido_grave"));
        double w3 = num(pesos.get("w_herido_leve"));

        Map<String, Object> r = jdbc.queryForMap(
                "SELECT count(*) AS n, "
                + "count(*) FILTER (WHERE s.severidad = 'FALLECIDO') AS fal, "
                + "count(*) FILTER (WHERE s.severidad = 'CON_MUERTOS_O_GRAVES') AS gra, "
                + "count(*) FILTER (WHERE s.severidad = 'SOLO_HERIDOS_LEVES') AS lev, "
                + "count(*) FILTER ("
                + "WHERE s.clima = ANY(c.clima_adverso) "
                + "OR s.calzada = ANY(c.calzada_adversa)"
                + ") AS adv, "
                + "avg(s.tiempo_respuesta_min) AS tpr "
                + "FROM sinister s "
                + "CROSS JOIN system_config c "
                + "WHERE c.id = 1 AND " + todas.sql(),
                todas.p()
        );

        long n = lng(r.get("n"));
        long fal = lng(r.get("fal"));
        long gra = lng(r.get("gra"));
        long lev = lng(r.get("lev"));
        long adv = lng(r.get("adv"));

        Double tpr = r.get("tpr") == null
                ? null
                : num(r.get("tpr"));

        Map<String, Object> pv = jdbc.queryForMap(
                "SELECT count(*) FILTER (WHERE v.tipo_lesion = 'MUERTE_EN_SITIO') AS fal, "
                + "count(*) FILTER (WHERE v.tipo_lesion = 'HERIDO_GRAVE') AS gra, "
                + "count(*) FILTER (WHERE v.tipo_lesion = 'HERIDO_LEVE') AS lev "
                + "FROM victim v WHERE " + filtrosVictimas.sql(),
                filtrosVictimas.p());
        long pFal = lng(pv.get("fal")), pGra = lng(pv.get("gra")), pLev = lng(pv.get("lev"));
        long victimas = pFal + pGra + pLev;   // personas afectadas (sin contar ilesos)

        double iss = n == 0 ? 0 : (w1 * fal + w2 * gra + w3 * lev) / n;   // sigue usando la gravedad del siniestro

        return new Kpis(n, total, pct(n, nac), iss, tpr, victimas, pFal, pGra, pLev, pct(adv, n));
    }

    // ================================================================
    // Gráficos
    // ================================================================

    private List<ItemConteo> provincias(Clausula nacional) {

        long base = contar(nacional);

        Map<String, Long> conteo =
                conteo("s.provincia", nacional, StatsManager::norm);

        List<ItemConteo> lista = new ArrayList<>();

        for (String provincia : PROVINCIAS) {
            long n = conteo.getOrDefault(norm(provincia), 0L);

            lista.add(new ItemConteo(
                    provincia,
                    n,
                    pct(n, base)
            ));
        }

        lista.sort((a, b) -> Long.compare(b.valor(), a.valor()));

        return lista;
    }

    private List<ItemConteo> severidades(Clausula c) {

        long base = contar(c);

        Map<String, Long> conteo =
                conteo("s.severidad", c, StatsManager::claveSeveridad);

        List<ItemConteo> lista = new ArrayList<>();

        for (String severidad : SEVERIDADES) {

            long n = conteo.getOrDefault(
                    claveSeveridad(severidad),
                    0L
            );

            lista.add(new ItemConteo(
                    severidad,
                    n,
                    pct(n, base)
            ));
        }

        return lista;
    }

    private List<ItemVehiculo> vehiculos(Clausula c) {

        String donde = c.sql() + " AND v.vehiculo IS NOT NULL AND v.vehiculo <> 'No aplica'";

        Long base = jdbc.queryForObject(
                "SELECT count(*) FROM victim v WHERE " + donde, c.p(), Long.class);
        long total = base == null ? 0 : base;

        return jdbc.query(
                "SELECT v.vehiculo AS k, count(*) AS n, "
                + "count(*) FILTER (WHERE v.tipo_lesion = 'MUERTE_EN_SITIO') AS fal "
                + "FROM victim v WHERE " + donde
                + " GROUP BY 1 ORDER BY 2 DESC LIMIT 8",
                c.p(),
                (rs, i) -> {
                    long n = rs.getLong("n");
                    return new ItemVehiculo(
                            rs.getString("k"), n, pct(n, total), pct(rs.getLong("fal"), n));
                });
    }

    private List<ItemRuta> rutas(Clausula c) {

        long base = contar(c);

        List<Fila> filas = jdbc.query(
                "SELECT s.ruta, count(*) "
                + "FROM sinister s "
                + "WHERE " + c.sql()
                + " AND s.ruta ~ '^[0-9]+$' "
                + "GROUP BY 1 "
                + "ORDER BY 2 DESC "
                + "LIMIT 8",
                c.p(),
                (rs, i) -> new Fila(
                        rs.getString(1),
                        rs.getLong(2)
                )
        );

        List<ItemRuta> lista = new ArrayList<>();

        long acumulado = 0;

        for (Fila fila : filas) {

            acumulado += fila.n();

            lista.add(new ItemRuta(
                    "Ruta " + fila.k(),
                    fila.n(),
                    pct(fila.n(), base),
                    pct(acumulado, base)
            ));
        }

        return lista;
    }

    private MatrizDiaFranja matriz(Clausula c) {

        long[][] m = new long[DIAS.size()][FRANJAS.size()];

        jdbc.query(
                "SELECT s.dia_semana, s.franja, count(*) "
                + "FROM sinister s "
                + "WHERE " + c.sql()
                + " GROUP BY 1, 2",
                c.p(),
                (RowCallbackHandler) rs -> {

                    int d = indice(DIAS, rs.getString(1));
                    int fr = indice(FRANJAS, rs.getString(2));

                    if (d >= 0 && fr >= 0) {
                        m[d][fr] += rs.getLong(3);
                    }
                }
        );

        List<List<Long>> valores = new ArrayList<>();

        long max = 0;

        for (long[] fila : m) {

            List<Long> l = new ArrayList<>();

            for (long v : fila) {
                l.add(v);
                max = Math.max(max, v);
            }

            valores.add(l);
        }

        return new MatrizDiaFranja(
                DIAS,
                FRANJAS,
                valores,
                max
        );
    }

    // ================================================================
    // Víctimas y perfil demográfico
    // ================================================================

    /*
     * Los registros de victim no tienen sinister_id.
     *
     * Por eso solo se aplican filtros que existen directamente en victim:
     * provincia, cantón, distrito, año, mes, día, edad y género.
     *
     * No se aplican filtros de ruta, clima, calzada, franja, vehículo
     * ni severidad del siniestro.
     */
    private Clausula dondeVictimas(DashboardFilters f, boolean ignorarVehiculo) {

        List<String> condiciones = new ArrayList<>();

        condiciones.add("v.calidad = 'VALIDO'");

        MapSqlParameterSource p = new MapSqlParameterSource();

        if (hay(f.provincia())) {
            condiciones.add(sqlNorm("v.provincia") + " = :provincia");
            p.addValue("provincia", norm(f.provincia()));
        }

        if (hay(f.canton())) {
            condiciones.add(sqlNorm("v.canton") + " = :canton");
            p.addValue("canton", norm(f.canton()));
        }

        if (hay(f.distrito())) {
            condiciones.add(sqlNorm("v.distrito") + " = :distrito");
            p.addValue("distrito", norm(f.distrito()));
        }

        if (!f.anios().isEmpty()) {
            condiciones.add("v.anio IN (:anios)");
            p.addValue("anios", f.anios());
        }

        if (!f.meses().isEmpty()) {
            condiciones.add("v.mes IN (:meses)");
            p.addValue("meses", f.meses());
        }

        if (!f.dias().isEmpty()) {
            condiciones.add(sqlNorm("v.dia_semana") + " IN (:dias)");
            p.addValue("dias", normalizar(f.dias()));
        }

        if (!f.edades().isEmpty()) {
            condiciones.add(EDAD_RANGO + " IN (:edades)");
            p.addValue("edades", f.edades());
        }

        if (!f.generos().isEmpty()) {
            condiciones.add("upper(v.genero) IN (:generos)");
            p.addValue("generos", normalizar(f.generos()));
        }

        if (!ignorarVehiculo && !f.vehiculos().isEmpty()) {
            condiciones.add("v.vehiculo IN (:vehiculos)");
            p.addValue("vehiculos", f.vehiculos());
        }

        return new Clausula(
                String.join(" AND ", condiciones),
                p
        );
    }

    private PerfilDemografico perfil(Clausula c) {

        String sql =
                "SELECT "
                + EDAD_RANGO + " AS edad_rango, "
                + "upper(v.genero) AS genero, "
                + "count(*) AS cantidad "
                + "FROM victim v "
                + "WHERE " + c.sql()
                + " AND " + EDAD_RANGO + " IS NOT NULL "
                + "GROUP BY 1, 2";

        long[] masc = new long[EDADES_PIRAMIDE.size()];
        long[] fem = new long[EDADES_PIRAMIDE.size()];

        jdbc.query(
                sql,
                c.p(),
                (RowCallbackHandler) rs -> {

                    int i = EDADES_PIRAMIDE.indexOf(
                            rs.getString("edad_rango")
                    );

                    if (i < 0) {
                        return;
                    }

                    String genero = norm(rs.getString("genero"));
                    long cantidad = rs.getLong("cantidad");

                    if (genero.equals("MASCULINO")) {
                        masc[i] += cantidad;
                    } else if (genero.equals("FEMENINO")) {
                        fem[i] += cantidad;
                    }
                }
        );

        List<Long> masculino = new ArrayList<>();
        List<Long> femenino = new ArrayList<>();

        for (int i = 0; i < masc.length; i++) {
            masculino.add(masc[i]);
            femenino.add(fem[i]);
        }

        return new PerfilDemografico(
                EDADES_PIRAMIDE,
                masculino,
                femenino
        );
    }

    // ================================================================
    // Resumen público
    // ================================================================

    public PublicSummary resumenPublico() {

        Clausula c = donde(
                DashboardFilters.vacio(),
                Set.of()
        );

        long base = contar(c);

        List<ItemConteo> porAnio = jdbc.query(
                "SELECT s.anio, count(*) "
                + "FROM sinister s "
                + "WHERE " + c.sql()
                + " AND s.anio IS NOT NULL "
                + "GROUP BY 1 "
                + "ORDER BY 1",
                c.p(),
                (rs, i) -> new ItemConteo(
                        String.valueOf(rs.getInt(1)),
                        rs.getLong(2),
                        pct(rs.getLong(2), base)
                )
        );

        Map<String, Long> fr = conteo(
                "s.franja",
                c,
                StatsManager::norm
        );

        List<ItemConteo> porFranja = new ArrayList<>();

        for (String franja : FRANJAS) {

            long n = fr.getOrDefault(norm(franja), 0L);

            porFranja.add(new ItemConteo(
                    franja,
                    n,
                    pct(n, base)
            ));
        }

        return new PublicSummary(
                base,
                porAnio,
                provincias(c),
                severidades(c),
                porFranja
        );
    }

    // ================================================================
    // Filtros de siniestros
    // ================================================================

    /*
     * Esta cláusula trabaja exclusivamente con sinister.
     * Los filtros demográficos no se aplican aquí porque no existe
     * una relación entre las filas de victim y las de sinister.
     */
    private Clausula donde(
            DashboardFilters f,
            Set<String> ignorar) {

        List<String> condiciones = new ArrayList<>();

        condiciones.add("s.calidad = 'VALIDO'");

        MapSqlParameterSource p = new MapSqlParameterSource();

        if (!ignorar.contains("provincia") && hay(f.provincia())) {
            condiciones.add(sqlNorm("s.provincia") + " = :provincia");
            p.addValue("provincia", norm(f.provincia()));
        }

        if (!ignorar.contains("canton") && hay(f.canton())) {
            condiciones.add(sqlNorm("s.canton") + " = :canton");
            p.addValue("canton", norm(f.canton()));
        }

        if (!ignorar.contains("distrito") && hay(f.distrito())) {
            condiciones.add(sqlNorm("s.distrito") + " = :distrito");
            p.addValue("distrito", norm(f.distrito()));
        }

        if (!ignorar.contains("ruta") && hay(f.ruta())) {
            condiciones.add("s.ruta = :ruta");

            p.addValue(
                    "ruta",
                    norm(f.ruta()).replaceFirst("^RUTA_", "")
            );
        }

        lista(condiciones, p, ignorar, "anios", "s.anio", f.anios());
        lista(condiciones, p, ignorar, "meses", "s.mes", f.meses());

        lista(
                condiciones, p, ignorar,
                "dias", "s.dia_semana", normalizar(f.dias())
        );

        lista(
                condiciones, p, ignorar,
                "franjas", "s.franja", normalizar(f.franjas())
        );

        lista(
                condiciones, p, ignorar,
                "climas", "s.clima", normalizar(f.climas())
        );

        lista(
                condiciones, p, ignorar,
                "calzadas", "s.calzada", normalizar(f.calzadas())
        );

        if (!ignorar.contains("severidades")
                && !f.severidades().isEmpty()) {

            List<String> or = new ArrayList<>();

            int i = 0;

            for (String severidad : f.severidades()) {

                String valor = claveSeveridad(severidad);

                String columna = "s.severidad = :sev" + i;

                or.add(columna);

                p.addValue("sev" + i, valor);

                i++;
            }

            condiciones.add("(" + String.join(" OR ", or) + ")");
        }

        return new Clausula(
                String.join(" AND ", condiciones),
                p
        );
    }

    private static <T> void lista(
            List<String> condiciones,
            MapSqlParameterSource p,
            Set<String> ignorar,
            String clave,
            String columna,
            List<T> valores) {

        if (ignorar.contains(clave) || valores.isEmpty()) {
            return;
        }

        condiciones.add(columna + " IN (:" + clave + ")");

        p.addValue(clave, valores);
    }

    // ================================================================
    // Utilidades
    // ================================================================

    private long contar(Clausula c) {

        return contar(
                "SELECT count(*) FROM sinister s WHERE ",
                c
        );
    }

    private long contar(String prefijo, Clausula c) {

        Long n = jdbc.queryForObject(
                prefijo + c.sql(),
                c.p(),
                Long.class
        );

        return n == null ? 0 : n;
    }

    private Map<String, Long> conteo(
            String columna,
            Clausula c,
            UnaryOperator<String> clave) {

        Map<String, Long> resultado = new HashMap<>();

        jdbc.query(
                "SELECT " + columna + ", count(*) "
                + "FROM sinister s "
                + "WHERE " + c.sql()
                + " AND " + columna + " IS NOT NULL "
                + "GROUP BY 1",
                c.p(),
                (RowCallbackHandler) rs -> resultado.merge(
                        clave.apply(rs.getString(1)),
                        rs.getLong(2),
                        Long::sum
                )
        );

        return resultado;
    }

    private static int indice(
            List<String> catalogo,
            String crudo) {

        if (crudo == null) {
            return -1;
        }

        String k = norm(crudo);

        for (int i = 0; i < catalogo.size(); i++) {
            if (norm(catalogo.get(i)).equals(k)) {
                return i;
            }
        }

        return -1;
    }

    /*
     * Traduce tanto las etiquetas del frontend como los valores reales
     * almacenados en la columna sinister.severidad.
     */
    private static String claveSeveridad(String crudo) {

        String k = norm(crudo);

        if (k.equals("FALLECIDO") || k.startsWith("FALLEC")) {
            return "FALLECIDO";
        }

        if (k.equals("GRAVE")
                || k.equals("CON_MUERTOS_O_GRAVES")) {
            return "CON_MUERTOS_O_GRAVES";
        }

        if (k.equals("LEVE")
                || k.equals("SOLO_HERIDOS_LEVES")) {
            return "SOLO_HERIDOS_LEVES";
        }

        return k;
    }

    static String norm(String s) {

        if (s == null) {
            return "";
        }

        String t = Normalizer.normalize(
                s.trim(),
                Normalizer.Form.NFD
        ).replaceAll("\\p{M}", "");

        return t.toUpperCase(Locale.ROOT)
                .replaceAll("\\s+", "_");
    }

    private static List<String> normalizar(List<String> valores) {

        return valores.stream()
                .map(StatsManager::norm)
                .toList();
    }

    /*
     * Normalización SQL equivalente a norm():
     * elimina tildes, convierte a mayúsculas y reemplaza espacios por "_".
     */
    private static String sqlNorm(String columna) {

        return "upper(translate("
                + columna
                + ", 'áéíóúÁÉÍÓÚñÑ ', 'aeiouAEIOUnN_'))";
    }

    private static boolean hay(String s) {
        return s != null && !s.isBlank();
    }

    private static double pct(long parte, long total) {
        return total == 0 ? 0 : 100.0 * parte / total;
    }

    private static double num(Object o) {
        return ((Number) o).doubleValue();
    }

    private static long lng(Object o) {
        return ((Number) o).longValue();
    }
}
