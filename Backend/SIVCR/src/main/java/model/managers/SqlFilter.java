package model.managers;

import java.util.ArrayList;
import java.util.List;
import model.FilterCriteria;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;


final class SqlFilter {

    private final String where;
    private final String victimWhere;
    private final MapSqlParameterSource params;

    private SqlFilter(String where, String victimWhere, MapSqlParameterSource params) {
        this.where = where;
        this.victimWhere = victimWhere;
        this.params = params;
    }

    String where() { return where; }

    // Condiciones solo de género y edad sobre el alias v (victim); TRUE si no hay ninguna. 
    String victimWhere() { return victimWhere; }

    // Parámetros nombrados.
    MapSqlParameterSource params() { return params; }

    // Filtro completo. 
    static SqlFilter of(FilterCriteria f) {
        return build(f, false);
    }

    // Igual, pero ignora provincia, cantón, distrito y ruta.
    static SqlFilter nationalOf(FilterCriteria f) {
        return build(f, true);
    }

    private static SqlFilter build(FilterCriteria f, boolean ignoreGeo) {
        List<String> c = new ArrayList<>();
        List<String> v = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource();

        c.add("s.calidad = 'VALIDO'");

        if (!ignoreGeo) {
            if (f.getProvincia() != null) eq(c, p, "s.provincia", "provincia", f.getProvincia().name());
            eq(c, p, "s.canton", "canton", text(f.getCanton()));
            eq(c, p, "s.distrito", "distrito", text(f.getDistrito()));
            eq(c, p, "s.ruta", "ruta", text(f.getRuta()));
        }

        if (f.getAnio() > 0) eq(c, p, "s.anio", "anio", f.getAnio());
        if (f.getMes() > 0) eq(c, p, "s.mes", "mes", f.getMes());
        if (f.getDiaSemana() != null) eq(c, p, "s.dia_semana", "diaSemana", f.getDiaSemana().name());
        if (f.getFranja() != null) eq(c, p, "s.franja", "franja", f.getFranja().name());
        if (f.getTipoVehiculo() != null) eq(c, p, "s.tipo_vehiculo", "tipoVehiculo", f.getTipoVehiculo().name());
        if (f.getSeveridad() != null) eq(c, p, "s.severidad", "severidad", f.getSeveridad().name());
        if (f.getClima() != null) eq(c, p, "s.clima", "clima", f.getClima().name());
        if (f.getCalzada() != null) eq(c, p, "s.calzada", "calzada", f.getCalzada().name());

        if (f.getGenero() != null) eq(v, p, "v.genero", "genero", f.getGenero().name());
        if (f.getEdadMin() > 0) { v.add("v.edad >= :edadMin"); p.addValue("edadMin", f.getEdadMin()); }
        if (f.getEdadMax() > 0) { v.add("v.edad <= :edadMax"); p.addValue("edadMax", f.getEdadMax()); }

        String victimWhere = v.isEmpty() ? "TRUE" : String.join(" AND ", v);
        if (!v.isEmpty()) {
            c.add("EXISTS (SELECT 1 FROM victim v WHERE v.sinister_id = s.id AND " + victimWhere + ")");
        }
        return new SqlFilter(String.join(" AND ", c), victimWhere, p);
    }

    private static void eq(List<String> conditions, MapSqlParameterSource p, String column, String name, Object value) {
        if (value != null) {
            conditions.add(column + " = :" + name);
            p.addValue(name, value);
        }
    }

    // Texto libre: recorta espacios y trata vacío como sin filtro. 
    private static String text(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
