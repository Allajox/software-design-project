package app.persistence;

import enums.Climate;
import enums.Day;
import enums.Province;
import enums.QualityStatus;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import model.FilterCriteria;
import model.Sinister;
import model.SinisterRepository;
import model.dto.Page;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Lee siniestros de la tabla sinister. Solo registros VALIDO: los INCOMPLETO no alimentan lo oficial. Los valores del
 * usuario siempre van como parámetros; el SQL solo lleva constantes de esta clase.
 */
@Repository
public class JdbcSinisterRepository implements SinisterRepository {

    private static final String COLUMNAS =
        "SELECT provincia, canton, distrito, ruta, km, lat, lon, tipo_vehiculo, severidad, clima, calzada, "
      + "tiempo_respuesta_min, calidad, fecha, anio, mes, dia_semana, franja FROM sinister";

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcSinisterRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** WHERE ya armado y sus parámetros. */
    private record Consulta(String where, MapSqlParameterSource parametros) {}

    @Override
    public List<Sinister> buscar(FilterCriteria c) {
        Consulta q = armarConsulta(c);
        return jdbc.query(COLUMNAS + q.where() + " ORDER BY anio, mes, id", q.parametros(),
            JdbcSinisterRepository::filaASiniestro);
    }

    @Override
    public Page<Sinister> buscar(FilterCriteria c, int pagina, int tamano, String campoOrden, boolean descendente) {
        String orden = " ORDER BY anio, mes, id";
        if (campoOrden != null) {
            if (!CAMPOS_ORDENABLES.contains(campoOrden)) { // los nombres coinciden con las columnas
                throw new IllegalArgumentException("Campo de orden no permitido: " + campoOrden);
            }
            orden = " ORDER BY " + campoOrden + (descendente ? " DESC" : " ASC") + ", id";
        }
        Consulta q = armarConsulta(c);
        Long total = jdbc.queryForObject("SELECT count(*) FROM sinister" + q.where(), q.parametros(), Long.class);

        q.parametros().addValue("limite", tamano);
        q.parametros().addValue("desplazamiento", (long) pagina * tamano);
        List<Sinister> contenido = jdbc.query(
            COLUMNAS + q.where() + orden + " LIMIT :limite OFFSET :desplazamiento",
            q.parametros(), JdbcSinisterRepository::filaASiniestro);
        return new Page<>(contenido, total == null ? 0 : total, pagina, tamano);
    }

    private Consulta armarConsulta(FilterCriteria c) {
        // Solo registros VALIDO: los INCOMPLETO no alimentan lo oficial
        StringBuilder sql = new StringBuilder(" WHERE calidad = 'VALIDO'");
        MapSqlParameterSource p = new MapSqlParameterSource();

        // --- Filtros de texto / enums (null = sin filtro) ---
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
        if (c.ruta() != null) {
            sql.append(" AND ruta = :ruta");
            p.addValue("ruta", c.ruta());
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

        // --- Tiempo: COSEVI no trae fecha exacta, trae anio, mes, dia_semana y franja ---
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
        if (c.franja() != null) {
            // TimeSlot guarda MADRUGADA, MANANA, TARDE, NOCHE, igual que la columna franja
            sql.append(" AND franja = :franja");
            p.addValue("franja", c.franja().name());
        }
        return new Consulta(sql.toString(), p);
    }

    private static Sinister filaASiniestro(ResultSet rs, int fila) throws SQLException {
        Timestamp fecha = rs.getTimestamp("fecha");
        // Las columnas de COSEVI pueden venir en NULL (fecha, lat, lon, tipo_vehiculo...): se conservan como null
        // en vez de convertirlas en 0 o hacer fallar la lectura.
        return new Sinister(
            aEnum(Province.class, rs.getString("provincia")),
            rs.getString("canton"),
            rs.getString("distrito"),
            rs.getString("ruta"),
            decimalONulo(rs, "km"),
            decimalONulo(rs, "lat"),
            decimalONulo(rs, "lon"),
            aEnum(VehycleType.class, rs.getString("tipo_vehiculo")),
            aEnum(Severity.class, rs.getString("severidad")),
            aEnum(Climate.class, rs.getString("clima")),
            aEnum(RoadStatus.class, rs.getString("calzada")),
            decimalONulo(rs, "tiempo_respuesta_min"),
            aEnum(QualityStatus.class, rs.getString("calidad")),
            fecha == null ? null : fecha.toLocalDateTime(),
            enteroONulo(rs, "anio"),
            enteroONulo(rs, "mes"),
            aEnum(Day.class, rs.getString("dia_semana")),
            aEnum(TimeSlot.class, rs.getString("franja"))
        );
    }

    // Si la base trae un valor que el enum no conoce (una fuente nueva, un enum desactualizado) sale null
    // en lugar de tumbar toda la consulta. Los enums actuales coinciden con los valores de los perfiles de ingesta.
    private static <E extends Enum<E>> E aEnum(Class<E> tipo, String valor) {
        if (valor == null) {
            return null;
        }
        try {
            return Enum.valueOf(tipo, valor);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Double decimalONulo(ResultSet rs, String columna) throws SQLException {
        double valor = rs.getDouble(columna);
        return rs.wasNull() ? null : valor;
    }

    private static Integer enteroONulo(ResultSet rs, String columna) throws SQLException {
        int valor = rs.getInt(columna);
        return rs.wasNull() ? null : valor;
    }
}
