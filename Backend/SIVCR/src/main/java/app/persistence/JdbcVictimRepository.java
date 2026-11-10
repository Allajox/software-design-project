package app.persistence;

import enums.Gender;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import model.FilterCriteria;
import model.PerfilVictimas;
import model.PerfilVictimas.FatalidadPorVehiculo;
import model.PerfilVictimas.TramoEdad;
import model.VictimRepository;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Lee el perfil de víctimas y riesgo: agregados sobre la tabla victim (personas de COSEVI). Solo lee personas VALIDO; las
 * INCOMPLETO no alimentan lo oficial. COSEVI no permite enlazar una persona con su siniestro (victim.sinister_id es
 * nulo), por eso esta consulta es aparte de la de siniestros y solo usa los filtros que existen en victim.
 *
 * Los valores del usuario siempre van como parámetros; el SQL solo lleva constantes de esta clase.
 */
@Repository
public class JdbcVictimRepository implements VictimRepository {
    /** Ancho de cada tramo de edad (igual que "Edad quinquenal" de COSEVI) y número del último tramo (75 y más). */
    static final int ANCHO_TRAMO = 5;
    static final int ULTIMO_TRAMO = 15;
    /** Valor normalizado de victim.rol para peatones (perfil cosevi-personas) y su etiqueta en la gráfica. */
    static final String ROL_PEATON = "PEATON";
    static final String GRUPO_PEATON = "Peatón";
    static final String GRUPO_SIN_DATO = "Sin dato";
    /** Valor normalizado de victim.tipo_lesion para "Muerte en sitio". */
    static final String LESION_MORTAL = "MUERTE_EN_SITIO";

    private final NamedParameterJdbcTemplate jdbc;

    public JdbcVictimRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** WHERE ya armado y sus parámetros. */
    private record Consulta(String where, MapSqlParameterSource parametros) { }

    @Override
    public PerfilVictimas perfil(FilterCriteria c) {
        Consulta q = armarConsulta(c);

        // totales: personas, sin edad, sin género (masculino/femenino)
        long[] totales = jdbc.queryForObject(
            "SELECT count(*), count(*) FILTER (WHERE edad IS NULL), "
          + "count(*) FILTER (WHERE genero IS NULL OR genero NOT IN ('" + Gender.MASCULINO.name() + "', '"
          + Gender.FEMENINO.name() + "')) FROM victim" + q.where(),
            q.parametros(), (rs, fila) -> new long[] {rs.getLong(1), rs.getLong(2), rs.getLong(3)});

        // personas por tramo de edad y género
        long[] masculino = new long[ULTIMO_TRAMO + 1];
        long[] femenino = new long[ULTIMO_TRAMO + 1];
        jdbc.query(
            "SELECT LEAST(edad / " + ANCHO_TRAMO + ", " + ULTIMO_TRAMO + ") AS tramo, genero, count(*) AS n "
          + "FROM victim" + q.where() + " AND edad IS NOT NULL AND genero IN ('" + Gender.MASCULINO.name() + "', '"
          + Gender.FEMENINO.name() + "') GROUP BY 1, 2",
            q.parametros(), rs -> {
                int tramo = rs.getInt("tramo");
                if (Gender.MASCULINO.name().equals(rs.getString("genero"))) {
                    masculino[tramo] = rs.getLong("n");
                } else {
                    femenino[tramo] = rs.getLong("n");
                }
            });

        // fatalidad por vehículo: peatones aparte; el resto por el texto de COSEVI "vehículo en el que viajaba"
        MapSqlParameterSource p = new MapSqlParameterSource(q.parametros().getValues())
            .addValue("rolPeaton", ROL_PEATON)
            .addValue("etiquetaPeaton", GRUPO_PEATON)
            .addValue("sinDato", GRUPO_SIN_DATO)
            .addValue("lesionMortal", LESION_MORTAL);
        List<FatalidadPorVehiculo> fatalidad = new ArrayList<>(jdbc.query(
            "SELECT CASE WHEN rol = :rolPeaton THEN CAST(:etiquetaPeaton AS text) "
          + "ELSE COALESCE(NULLIF(btrim(vehiculo), ''), CAST(:sinDato AS text)) END AS grupo, "
          + "count(*) AS personas, count(*) FILTER (WHERE tipo_lesion = :lesionMortal) AS fallecidos "
          + "FROM victim" + q.where() + " GROUP BY 1",
            p, (rs, fila) -> grupo(rs.getString("grupo"), rs.getLong("personas"), rs.getLong("fallecidos"))));
        fatalidad.sort(Comparator.comparingDouble(FatalidadPorVehiculo::tasa).reversed()
            .thenComparing(Comparator.comparingLong(FatalidadPorVehiculo::personas).reversed())
            .thenComparing(FatalidadPorVehiculo::vehiculo, String.CASE_INSENSITIVE_ORDER));

        return new PerfilVictimas(totales[0], totales[1], totales[2], tramos(masculino, femenino), fatalidad,
            filtrosNoAplicados(c));
    }

    /** Filtros de víctimas: los de ubicación y tiempo que existen en victim, más edad y género. */
    private static Consulta armarConsulta(FilterCriteria c) {
        StringBuilder sql = new StringBuilder(" WHERE calidad = 'VALIDO'");
        MapSqlParameterSource p = new MapSqlParameterSource();
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
        if (c.anio() != null) {
            sql.append(" AND anio = :anio");
            p.addValue("anio", c.anio());
        }
        if (c.mes() != null) {
            sql.append(" AND mes = :mes");
            p.addValue("mes", c.mes());
        }
        if (c.diaSemana() != null) {
            sql.append(" AND dia_semana = :dia");
            p.addValue("dia", c.diaSemana().name());
        }
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

    /**
     * Filtros del pedido que la tabla de personas no tiene (son de siniestros). Se ignoran, pero se informan para
     * que la pantalla los avise en vez de aparentar que se aplicaron.
     */
    static List<String> filtrosNoAplicados(FilterCriteria c) {
        List<String> nombres = new ArrayList<>();
        if (c.ruta() != null) {
            nombres.add("ruta");
        }
        if (c.franja() != null) {
            nombres.add("franja");
        }
        if (c.tipoVehiculo() != null) {
            nombres.add("tipoVehiculo");
        }
        if (c.severidad() != null) {
            nombres.add("severidad");
        }
        if (c.clima() != null) {
            nombres.add("clima");
        }
        if (c.calzada() != null) {
            nombres.add("calzada");
        }
        return nombres;
    }

    static FatalidadPorVehiculo grupo(String vehiculo, long personas, long fallecidos) {
        return new FatalidadPorVehiculo(vehiculo, personas, fallecidos,
            personas == 0 ? 0 : (double) fallecidos / personas);
    }

    /** "0-4", "5-9", ... "70-74" y "75+". */
    static String etiquetaTramo(int tramo) {
        return tramo >= ULTIMO_TRAMO
            ? (ULTIMO_TRAMO * ANCHO_TRAMO) + "+"
            : (tramo * ANCHO_TRAMO) + "-" + (tramo * ANCHO_TRAMO + ANCHO_TRAMO - 1);
    }

    static List<TramoEdad> tramos(long[] masculino, long[] femenino) {
        List<TramoEdad> lista = new ArrayList<>();
        for (int t = 0; t <= ULTIMO_TRAMO; t++) {
            Integer hasta = t >= ULTIMO_TRAMO ? null : t * ANCHO_TRAMO + ANCHO_TRAMO - 1;
            lista.add(new TramoEdad(etiquetaTramo(t), t * ANCHO_TRAMO, hasta, masculino[t], femenino[t]));
        }
        return lista;
    }
}
