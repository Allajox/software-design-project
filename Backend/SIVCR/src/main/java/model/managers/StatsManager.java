package model.managers;

import enums.Day;
import enums.TimeSlot;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import model.FilterCriteria;
import model.dto.DashboardCharts;
import model.dto.FatalityByVehicle;
import model.dto.HeatmapData;
import model.dto.KPIResult;
import model.dto.KPIValue;
import model.dto.ParetoPoint;
import model.dto.PublicSummary;
import model.dto.VictimsByGenderAge;
import model.dto.ZoneShare;
import model.interfaces.IStatsManager;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

// Graficos
@Service
public class StatsManager implements IStatsManager {

    private static final List<String> AGE_RANGES = List.of("0-17", "18-25", "26-35", "36-45", "46-60", "61+");

    // Peso de cada severidad. 
    private static final String SEVERITY_WEIGHT =
            "CASE s.severidad " +
            "WHEN 'FALLECIDO' THEN c.w_fallecido " +
            "WHEN 'HERIDO_GRAVE' THEN c.w_herido_grave " +
            "WHEN 'HERIDO_LEVE' THEN c.w_herido_leve " +
            "WHEN 'SOLO_DANOS' THEN c.w_herido_leve " +
            "ELSE 0 END";

    // Rutas nacionales: incluye "Nacional" y "Nacional sin coordenada". 
    private static final String NATIONAL_ROUTE = "lower(s.tipo_ruta) LIKE 'nacional%'";

    private final NamedParameterJdbcTemplate jdbc;

    public StatsManager(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Utilidades (Matematicas y de conversión de tipos :c)
    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static Double toDouble(Object o) {
        return o == null ? null : ((Number) o).doubleValue();
    }

    private static KPIValue kpi(Double value, String unit, String scope) {
        return new KPIValue(value == null ? null : round(value), unit, scope);
    }

    @Override
    public String describeScope(FilterCriteria f) {
        List<String> parts = new ArrayList<>();
        if (f.getProvincia() != null) parts.add("provincia: " + f.getProvincia());
        if (f.getCanton() != null && !f.getCanton().isBlank()) parts.add("cantón: " + f.getCanton());
        if (f.getDistrito() != null && !f.getDistrito().isBlank()) parts.add("distrito: " + f.getDistrito());
        if (f.getRuta() != null && !f.getRuta().isBlank()) parts.add("ruta: " + f.getRuta());
        if (f.getAnio() > 0) parts.add("año: " + f.getAnio());
        if (f.getMes() > 0) parts.add("mes: " + f.getMes());
        if (f.getDiaSemana() != null) parts.add("día: " + f.getDiaSemana());
        if (f.getFranja() != null) parts.add("franja: " + f.getFranja());
        if (f.getTipoVehiculo() != null) parts.add("vehículo: " + f.getTipoVehiculo());
        if (f.getSeveridad() != null) parts.add("severidad: " + f.getSeveridad());
        if (f.getClima() != null) parts.add("clima: " + f.getClima());
        if (f.getCalzada() != null) parts.add("calzada: " + f.getCalzada());
        if (f.getGenero() != null) parts.add("género: " + f.getGenero());
        if (f.getEdadMin() > 0) parts.add("edad ≥ " + f.getEdadMin());
        if (f.getEdadMax() > 0) parts.add("edad ≤ " + f.getEdadMax());
        return parts.isEmpty() ? "Todos los registros válidos" : String.join("; ", parts);
    }


    // indicadores de siniestralidad y seguridad vial
    @Override
    public KPIResult getKPIs(FilterCriteria f) {
        SqlFilter w = SqlFilter.of(f);
        SqlFilter national = SqlFilter.nationalOf(f);
        String scope = describeScope(f);

        Map<String, Object> m = jdbc.queryForMap(
                "SELECT COUNT(*) AS total, " +
                "CAST(SUM(" + SEVERITY_WEIGHT + ") AS double precision) / NULLIF(COUNT(s.severidad), 0) AS iss, " +
                "CAST(AVG(s.tiempo_respuesta_min) FILTER (WHERE s.tiempo_respuesta_min >= 0) AS double precision) AS tpr, " +
                "COUNT(*) FILTER (WHERE s.clima = ANY(c.clima_adverso) OR s.calzada = ANY(c.calzada_adversa)) AS adversos " +
                "FROM sinister s CROSS JOIN system_config c " +
                "WHERE c.id = 1 AND " + w.where(),
                w.params());

        long total = ((Number) m.get("total")).longValue();
        long adversos = ((Number) m.get("adversos")).longValue();

        Long nationalTotal = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sinister s WHERE " + national.where(), national.params(), Long.class);
        long nat = nationalTotal == null ? 0 : nationalTotal;

        KPIResult.Tsv tsv = new KPIResult.Tsv(
                kpi(nat == 0 ? null : (double) total / nat * 100, "% del total nacional", scope),
                nat,
                zoneShares("s.provincia", false, w, nat),
                zoneShares("s.ruta", true, w, nat));

        return new KPIResult(
                total,
                tsv,
                kpi(total == 0 ? null : toDouble(m.get("iss")), "puntos ponderados por siniestro", scope),
                kpi(toDouble(m.get("tpr")), "minutos", scope),
                kpi(total == 0 ? null : (double) adversos / total * 100, "% de siniestros", scope));
    }

    // Aporte de cada zona (provincia o ruta) al total nacional. 
    private List<ZoneShare> zoneShares(String column, boolean limit, SqlFilter w, long nationalTotal) {
        return jdbc.query(
                "SELECT " + column + " AS zone, COUNT(*) AS incidents FROM sinister s " +
                "WHERE " + w.where() + " AND " + column + " IS NOT NULL " +
                "GROUP BY " + column + " ORDER BY incidents DESC" + (limit ? " LIMIT 20" : ""),
                w.params(),
                (rs, i) -> {
                    long n = rs.getLong("incidents");
                    return new ZoneShare(rs.getString("zone"), n,
                            nationalTotal == 0 ? 0 : round((double) n / nationalTotal * 100));
                });
    }

    // HU 17: mapa de calor día de la semana × franja horaria.
    @Override
    public HeatmapData getHeatmap(FilterCriteria f) {
        SqlFilter w = SqlFilter.of(f);
        List<String> days = Arrays.stream(Day.values()).map(Enum::name).toList();
        List<String> slots = Arrays.stream(TimeSlot.values()).map(Enum::name).toList();
        int[][] z = new int[days.size()][slots.size()];

        jdbc.query(
                "SELECT s.dia_semana AS d, s.franja AS t, COUNT(*) AS n FROM sinister s " +
                "WHERE " + w.where() + " AND s.dia_semana IS NOT NULL AND s.franja IS NOT NULL " +
                "GROUP BY s.dia_semana, s.franja",
                w.params(),
                rs -> {
                    int i = days.indexOf(rs.getString("d"));
                    int j = slots.indexOf(rs.getString("t"));
                    if (i >= 0 && j >= 0) {
                        z[i][j] = rs.getInt("n");
                    }
                });
        return new HeatmapData(days, slots, z);
    }

    // HU 18: Pareto de rutas nacionales
    @Override
    public List<ParetoPoint> getPareto(FilterCriteria f) {
        SqlFilter w = SqlFilter.of(f);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT s.ruta AS route, COUNT(*) AS incidents, " +
                "CAST(SUM(COUNT(*)) OVER () AS double precision) AS grand_total " +
                "FROM sinister s " +
                "WHERE " + w.where() + " AND " + NATIONAL_ROUTE + " AND s.ruta IS NOT NULL " +
                "GROUP BY s.ruta ORDER BY incidents DESC LIMIT 15",
                w.params());

        List<ParetoPoint> result = new ArrayList<>();
        long accumulated = 0;
        for (Map<String, Object> r : rows) {
            long n = ((Number) r.get("incidents")).longValue();
            accumulated += n;
            double pct = Math.round(accumulated / ((Number) r.get("grand_total")).doubleValue() * 1000.0) / 10.0;
            result.add(new ParetoPoint((String) r.get("route"), n, pct));
        }
        return result;
    }

    // HU 14: víctimas por género y rango de edad
    private VictimsByGenderAge getVictims(FilterCriteria f) {
        SqlFilter w = SqlFilter.of(f);
        Map<String, long[]> byGender = new LinkedHashMap<>();

        jdbc.query(
                "SELECT v.genero AS gender, " +
                "CASE WHEN v.edad < 18 THEN '0-17' WHEN v.edad <= 25 THEN '18-25' WHEN v.edad <= 35 THEN '26-35' " +
                "WHEN v.edad <= 45 THEN '36-45' WHEN v.edad <= 60 THEN '46-60' ELSE '61+' END AS rango, " +
                "COUNT(*) AS n " +
                "FROM victim v JOIN sinister s ON s.id = v.sinister_id " +
                "WHERE " + w.where() + " AND " + w.victimWhere() + " AND v.edad IS NOT NULL AND v.genero IS NOT NULL " +
                "GROUP BY 1, 2",
                w.params(),
                rs -> {
                    long[] counts = byGender.computeIfAbsent(rs.getString("gender"), k -> new long[AGE_RANGES.size()]);
                    int idx = AGE_RANGES.indexOf(rs.getString("rango"));
                    if (idx >= 0) {
                        counts[idx] = rs.getLong("n");
                    }
                });

        List<VictimsByGenderAge.Series> series = new ArrayList<>();
        byGender.forEach((gender, counts) ->
                series.add(new VictimsByGenderAge.Series(gender, Arrays.stream(counts).boxed().toList())));
        return new VictimsByGenderAge(AGE_RANGES, series);
    }


    // HU 15: tasa de fatalidad por tipo de vehículo
    private List<FatalityByVehicle> getFatality(FilterCriteria f) {
        SqlFilter w = SqlFilter.of(f);
        List<FatalityByVehicle> list = jdbc.query(
                "SELECT s.tipo_vehiculo AS vehicle, COUNT(*) AS total, " +
                "COUNT(*) FILTER (WHERE s.severidad = 'FALLECIDO') AS fatalities " +
                "FROM sinister s " +
                "WHERE " + w.where() + " AND s.tipo_vehiculo IS NOT NULL " +
                "GROUP BY s.tipo_vehiculo",
                w.params(),
                (rs, i) -> {
                    long total = rs.getLong("total");
                    long fatalities = rs.getLong("fatalities");
                    return new FatalityByVehicle(rs.getString("vehicle"), total, fatalities,
                            total == 0 ? 0 : round((double) fatalities / total * 100));
                });
        return list.stream()
                .sorted(Comparator.comparingDouble(FatalityByVehicle::fatalityRatePct).reversed())
                .toList();
    }


    // Gráficos agrupados
    @Override
    public DashboardCharts getCharts(FilterCriteria f) {
        return new DashboardCharts(getHeatmap(f), getPareto(f), getVictims(f), getFatality(f));
    }


    // HU 19: resumen público (solo agregados, sin filtros del cliente)
    @Override
    public PublicSummary getPublicSummary() {
        List<PublicSummary.ProvinceCount> byProvince = jdbc.getJdbcTemplate().query(
                "SELECT provincia, COUNT(*) AS n FROM sinister " +
                "WHERE calidad = 'VALIDO' AND provincia IS NOT NULL " +
                "GROUP BY provincia ORDER BY n DESC",
                (rs, i) -> new PublicSummary.ProvinceCount(rs.getString("provincia"), rs.getLong("n")));

        List<PublicSummary.YearCount> byYear = jdbc.getJdbcTemplate().query(
                "SELECT anio, COUNT(*) AS n FROM sinister " +
                "WHERE calidad = 'VALIDO' AND anio IS NOT NULL " +
                "GROUP BY anio ORDER BY anio",
                (rs, i) -> new PublicSummary.YearCount(rs.getInt("anio"), rs.getLong("n")));

        long total = byProvince.stream().mapToLong(PublicSummary.ProvinceCount::incidents).sum();
        PublicSummary.YearCount last = byYear.isEmpty() ? null : byYear.get(byYear.size() - 1);

        // Se muestra el total de siniestros del último año con datos.
        KPIValue tsv = new KPIValue(
                last == null ? null : (double) last.incidents(),
                "siniestros en el último año con datos",
                last == null ? "sin datos" : String.valueOf(last.year()));

        return new PublicSummary(total, tsv,
                byProvince.isEmpty() ? null : byProvince.get(0).province(),
                byProvince, byYear);
    }
}
