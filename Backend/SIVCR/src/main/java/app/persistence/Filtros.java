package app.persistence;

import enums.DataSource;
import model.FilterCriteria;
import model.StatsRepository.Alcance;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

/**
 * Único lugar donde un FilterCriteria se convierte en WHERE. Lo comparten los repositorios de siniestros, de víctimas
 * y de estadísticas, así un filtro nuevo se agrega una sola vez. Los valores del usuario siempre van como parámetros;
 * el SQL solo lleva constantes de esta clase.
 *
 * Los filtros se reparten así entre las dos tablas:
 * - ubicación (provincia, cantón, distrito) y tiempo (año, mes, día): existen en sinister y en victim;
 * - ruta, franja, vehículo, severidad, clima y calzada: solo en sinister;
 * - edad y género: solo en victim (COSEVI no permite enlazar una persona con su siniestro).
 */
final class Filtros {

    /** WHERE ya armado (siempre empieza con " WHERE ...") y sus parámetros. */
    record Consulta(String where, MapSqlParameterSource parametros) { }

    /**
     * Fuente cuyos siniestros alimentan los KPI. INEC también guarda fallecidos como siniestros (sinister) y esos
     * mismos hechos ya los reporta COSEVI: sumar ambas fuentes contaría dos veces. La fuente de cada carga está en
     * ingestion_log.
     */
    static final String FUENTE_DE_KPI = DataSource.COSEVI.name();

    private Filtros() { }

    /** Siniestros VALIDO de cualquier fuente con todos los filtros (tabla de registros y exportación). */
    static Consulta siniestros(FilterCriteria c) {
        StringBuilder sql = new StringBuilder(" WHERE calidad = 'VALIDO'");
        MapSqlParameterSource p = new MapSqlParameterSource();
        ubicacion(c, sql, p);
        ruta(c, sql, p);
        tiempo(c, sql, p);
        detalleDeSiniestro(c, sql, p);
        return new Consulta(sql.toString(), p);
    }

    /** Siniestros VALIDO de la fuente de KPI, con la parte de los filtros que indique el alcance. */
    static Consulta siniestrosParaKpi(FilterCriteria c, Alcance alcance) {
        StringBuilder sql = new StringBuilder(" WHERE calidad = 'VALIDO'"
            + " AND ingestion_log_id IN (SELECT id FROM ingestion_log WHERE fuente = :fuenteKpi)");
        MapSqlParameterSource p = new MapSqlParameterSource("fuenteKpi", FUENTE_DE_KPI);
        if (alcance != Alcance.SIN_GEOGRAFIA) {
            ubicacion(c, sql, p);
        }
        if (alcance == Alcance.COMPLETO) {
            ruta(c, sql, p);
        }
        tiempo(c, sql, p);
        if (alcance != Alcance.COMUN_CON_PERSONAS) {
            detalleDeSiniestro(c, sql, p);
        }
        return new Consulta(sql.toString(), p);
    }

    /** Personas VALIDO con los filtros que existen en victim, incluidos edad y género. */
    static Consulta personas(FilterCriteria c) {
        Consulta q = personasSinEdadNiGenero(c);
        StringBuilder sql = new StringBuilder(q.where());
        MapSqlParameterSource p = q.parametros();
        if (c.edadMin() != null) {
            sql.append(" AND edad >= :edadMin");
            p.addValue("edadMin", c.edadMin());
        }
        if (c.edadMax() != null) {
            sql.append(" AND edad <= :edadMax");
            p.addValue("edadMax", c.edadMax());
        }
        if (c.genero() != null) {
            sql.append(" AND genero = :genero");
            p.addValue("genero", c.genero().name());
        }
        return new Consulta(sql.toString(), p);
    }

    /** Personas VALIDO solo con ubicación y tiempo: la misma población que COMUN_CON_PERSONAS en siniestros. */
    static Consulta personasSinEdadNiGenero(FilterCriteria c) {
        StringBuilder sql = new StringBuilder(" WHERE calidad = 'VALIDO'");
        MapSqlParameterSource p = new MapSqlParameterSource();
        ubicacion(c, sql, p);
        tiempo(c, sql, p);
        return new Consulta(sql.toString(), p);
    }

    private static void ubicacion(FilterCriteria c, StringBuilder sql, MapSqlParameterSource p) {
        if (c.provincia() != null) {
            sql.append(" AND provincia = :provincia");
            p.addValue("provincia", c.provincia().name());
        }
        if (c.canton() != null) {
            sql.append(" AND canton = :canton");
            p.addValue("canton", c.canton());
        }
        if (c.distrito() != null) {
            sql.append(" AND distrito = :distrito");
            p.addValue("distrito", c.distrito());
        }
    }

    private static void ruta(FilterCriteria c, StringBuilder sql, MapSqlParameterSource p) {
        if (c.ruta() != null) {
            sql.append(" AND ruta = :ruta");
            p.addValue("ruta", c.ruta());
        }
    }

    // COSEVI no trae fecha exacta: trae año, mes, día de la semana y franja
    private static void tiempo(FilterCriteria c, StringBuilder sql, MapSqlParameterSource p) {
        if (c.anio() != null) {
            sql.append(" AND anio = :anio");
            p.addValue("anio", c.anio());
        }
        if (c.mes() != null) {
            sql.append(" AND mes = :mes");
            p.addValue("mes", c.mes());
        }
        if (c.diaSemana() != null) {
            // Day guarda LUNES ... DOMINGO, igual que la columna dia_semana
            sql.append(" AND dia_semana = :dia");
            p.addValue("dia", c.diaSemana().name());
        }
    }

    private static void detalleDeSiniestro(FilterCriteria c, StringBuilder sql, MapSqlParameterSource p) {
        if (c.franja() != null) {
            // TimeSlot guarda MADRUGADA, MANANA, TARDE, NOCHE, igual que la columna franja
            sql.append(" AND franja = :franja");
            p.addValue("franja", c.franja().name());
        }
        if (c.tipoVehiculo() != null) {
            sql.append(" AND tipo_vehiculo = :tipoVehiculo");
            p.addValue("tipoVehiculo", c.tipoVehiculo().name());
        }
        if (c.severidad() != null) {
            sql.append(" AND severidad = :severidad");
            p.addValue("severidad", c.severidad().name());
        }
        if (c.clima() != null) {
            sql.append(" AND clima = :clima");
            p.addValue("clima", c.clima().name());
        }
        if (c.calzada() != null) {
            sql.append(" AND calzada = :calzada");
            p.addValue("calzada", c.calzada().name());
        }
    }
}
