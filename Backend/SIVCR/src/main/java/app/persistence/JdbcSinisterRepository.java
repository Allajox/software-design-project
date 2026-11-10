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

    private static final String ORDEN_POR_OMISION = " ORDER BY anio, mes, id";

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcSinisterRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Sinister> buscar(FilterCriteria c) {
        Filtros.Consulta q = Filtros.siniestros(c);
        return jdbc.query(COLUMNAS + q.where() + ORDEN_POR_OMISION, q.parametros(),
            JdbcSinisterRepository::filaASiniestro);
    }

    @Override
    public Page<Sinister> buscar(FilterCriteria c, int pagina, int tamano, List<Orden> orden) {
        Filtros.Consulta q = Filtros.siniestros(c);
        Long total = jdbc.queryForObject("SELECT count(*) FROM sinister" + q.where(), q.parametros(), Long.class);

        q.parametros().addValue("limite", tamano);
        q.parametros().addValue("desplazamiento", (long) pagina * tamano);
        List<Sinister> contenido = jdbc.query(
            COLUMNAS + q.where() + clausulaOrden(orden) + " LIMIT :limite OFFSET :desplazamiento",
            q.parametros(), JdbcSinisterRepository::filaASiniestro);
        return new Page<>(contenido, total == null ? 0 : total, pagina, tamano);
    }

    /**
     * ORDER BY de los niveles pedidos, en ese orden, y el id al final para desempatar. Los nombres de campo coinciden
     * con las columnas y se validan contra la lista cerrada. Los vacíos van siempre al final, sea cual sea el sentido.
     */
    static String clausulaOrden(List<Orden> orden) {
        if (orden == null || orden.isEmpty()) {
            return ORDEN_POR_OMISION;
        }
        StringBuilder sql = new StringBuilder(" ORDER BY ");
        for (Orden nivel : orden) {
            if (!CAMPOS_ORDENABLES.contains(nivel.campo())) {
                throw new IllegalArgumentException("Campo de orden no permitido: " + nivel.campo());
            }
            sql.append(nivel.campo()).append(nivel.descendente() ? " DESC" : " ASC").append(" NULLS LAST, ");
        }
        return sql.append("id").toString();
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
