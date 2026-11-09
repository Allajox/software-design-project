package controller;

import enums.Climate;
import enums.Day;
import enums.Gender;
import enums.Province;
import enums.QualityStatus;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import enums.VictimCondition;
import java.util.ArrayList;
import java.util.List;
import model.ConcreteFilterCriteriaBuilder;
import model.FilterCriteriaDirector;
import model.FilterCriteria;
import model.Repository;
import model.Sinister;
import model.SavedFilter;
import model.User;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@Component
public class FilterManager {
    private ConcreteFilterCriteriaBuilder builder = new ConcreteFilterCriteriaBuilder();
    
    private Repository<Sinister> sinisterRepo;
    private Repository<SavedFilter> filtroRepo;
    private final NamedParameterJdbcTemplate jdbc;

    public FilterManager(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }
    /*
    public List<Sinister> aplicar(FilterCriteria c) {
        List<Sinister> list = new ArrayList<Sinister>();
        return list;
    }
    
    public Page<Sinister> getRegistros(FilterCriteria c, int pagina, String orden) {
        // To-do
        return c;
    }
    */
    
    public List<Sinister> aplicar(FilterCriteria c) {
        StringBuilder sql = new StringBuilder("SELECT * FROM sinister WHERE 1=1");
        MapSqlParameterSource p = new MapSqlParameterSource();

        // --- Filtros de texto / enums (null = sin filtro) ---
        if (c.getProvincia() != null) {
            sql.append(" AND provincia = :provincia");
            p.addValue("provincia", c.getProvincia().name());
        }
        if (c.getCanton() != null && !c.getCanton().isBlank()) {
            sql.append(" AND canton = :canton");
            p.addValue("canton", c.getCanton());
        }
        if (c.getDistrito() != null && !c.getDistrito().isBlank()) {
            sql.append(" AND distrito = :distrito");
            p.addValue("distrito", c.getDistrito());
        }
        if (c.getRuta() != null && !c.getRuta().isBlank()) {
            sql.append(" AND ruta = :ruta");
            p.addValue("ruta", c.getRuta());
        }
        if (c.getTipoVehiculo() != null) {
            sql.append(" AND tipo_vehiculo = :tipoVehiculo");
            p.addValue("tipoVehiculo", c.getTipoVehiculo().name());
        }
        if (c.getSeveridad() != null) {
            sql.append(" AND severidad = :severidad");
            p.addValue("severidad", c.getSeveridad().name());
        }
        if (c.getClima() != null) {
            sql.append(" AND clima = :clima");
            p.addValue("clima", c.getClima().name());
        }
        if (c.getCalzada() != null) {
            sql.append(" AND calzada = :calzada");
            p.addValue("calzada", c.getCalzada().name());
        }
        if (c.getGenero() != null) {
            sql.append(" AND genero = :genero");
            p.addValue("genero", c.getGenero().name());
        }
        if (c.getAnio() > 0) {
            sql.append(" AND EXTRACT(YEAR FROM fecha) = :anio");
            p.addValue("anio", c.getAnio());
        }
        if (c.getMes() > 0) {
            sql.append(" AND EXTRACT(MONTH FROM fecha) = :mes");
            p.addValue("mes", c.getMes());
        }
        if (c.getDiaSemana() != null) {
            // ISODOW: 1 = lunes ... 7 = domingo
            sql.append(" AND EXTRACT(ISODOW FROM fecha) = :dia");
            p.addValue("dia", c.getDiaSemana().ordinal() + 1); // ajusta según tu enum Day
        }
        if (c.getFranja() != null) {
            int[] rango = rangoHoras(c.getFranja());
            sql.append(" AND EXTRACT(HOUR FROM fecha) >= :horaIni")
               .append(" AND EXTRACT(HOUR FROM fecha) < :horaFin");
            p.addValue("horaIni", rango[0]);
            p.addValue("horaFin", rango[1]);
        }

        // --- Edad ---
        if (c.getEdadMin() > 0) {
            sql.append(" AND edad >= :edadMin");
            p.addValue("edadMin", c.getEdadMin());
        }
        if (c.getEdadMax() > 0) {
            sql.append(" AND edad <= :edadMax");
            p.addValue("edadMax", c.getEdadMax());
        }

        sql.append(" ORDER BY fecha");

        return jdbc.query(sql.toString(), p, (rs, i) -> new Sinister(
            Province.valueOf(rs.getString("provincia")),
            rs.getString("canton"),
            rs.getString("distrito"),
            rs.getString("ruta"),
            rs.getDouble("km"),
            rs.getDouble("lat"),
            rs.getDouble("lon"),
            VehycleType.valueOf(rs.getString("tipo_vehiculo")),
            Severity.valueOf(rs.getString("severidad")),
            Climate.valueOf(rs.getString("clima")),
            RoadStatus.valueOf(rs.getString("calzada")),
            rs.getDouble("tiempo_respuesta_min"),
            QualityStatus.valueOf(rs.getString("calidad")),
            rs.getTimestamp("fecha").toLocalDateTime(),
            rs.getInt("edad"),
            Gender.valueOf(rs.getString("genero")),
            VictimCondition.valueOf(rs.getString("condicion"))
        ));
    }
    
    private int[] rangoHoras(TimeSlot franja) {
    return switch (franja) {
        case MADRUGADA -> new int[]{0, 6};
        case MANANA    -> new int[]{6, 12};
        case TARDE     -> new int[]{12, 18};
        case NOCHE     -> new int[]{18, 24};
    };
}
    
    public SavedFilter guardarFiltro(String nombre, FilterCriteria c, User u) {
        SavedFilter filtro = new SavedFilter(nombre, c, u);
        return filtro;
    }
    
    public List<SavedFilter> getFiltrosGuardados(User u) {
        // To-do
        List<SavedFilter> list = new ArrayList<>();
        return list;
    }
    
    public FilterCriteria nuevoFiltro(Province provincia, String canton, String distrito, 
                                        String ruta, int anio, int mes, Day diaSemana, TimeSlot franja, 
                                        VehycleType tipoVehiculo, Severity severidad, Climate clima, 
                                        RoadStatus calzada, int edadMin, int edadMax, Gender genero) {
        
        builder.setProvincia(provincia);
        builder.setCanton(canton);
        builder.setDistrito(distrito);
        builder.setRuta(ruta);
        builder.setAnio(anio);
        builder.setMes(mes);
        builder.setDia(diaSemana);
        builder.setFranja(franja);
        builder.setVehiculo(tipoVehiculo);
        builder.setSeveridad(severidad);
        builder.setClima(clima);
        builder.setCalzada(calzada);
        builder.setEdad(edadMin, edadMax);
        builder.setGenero(genero);
        builder.build();
        
        return builder.getResult();
    }
    
    public FilterCriteria restablecer() {
        builder.reset();
        return builder.getResult();
    }
}
