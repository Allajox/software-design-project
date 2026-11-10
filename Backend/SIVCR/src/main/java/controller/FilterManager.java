package controller;

import app.persistence.FilterRecordRepository;
import enums.Climate;
import enums.Day;
import enums.Province;
import enums.QualityStatus;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import java.sql.Timestamp;
import java.util.List;
import model.ConcreteFilterCriteriaBuilder;
import model.FilterCriteria;
import model.Repository;
import model.Sinister;
import model.SavedFilter;
import model.User;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class FilterManager {
    private ConcreteFilterCriteriaBuilder builder = new ConcreteFilterCriteriaBuilder();
    
    private Repository<Sinister> sinisterRepo;
    private FilterRecordRepository filtroRepo;
    private final NamedParameterJdbcTemplate jdbc;

    public FilterManager(NamedParameterJdbcTemplate jdbc, 
                        @Qualifier("filterRepository") FilterRecordRepository filtroRepo,
                        @Qualifier("userRepository") Repository<User> userRepo) {
        this.jdbc = jdbc;
        this.filtroRepo = filtroRepo;
        this.userRepo = userRepo;
    }
    /*
    public Page<Sinister> getRegistros(FilterCriteria c, int pagina, String orden) {
        // To-do
        return c;
    }
    */
    
    // Applies the given filter and returns all sinisters that match
    public List<Sinister> aplicar(FilterCriteria c) {
        StringBuilder sql = new StringBuilder("SELECT * FROM sinister WHERE 1=1");
        MapSqlParameterSource p = new MapSqlParameterSource();

        // null = no filter applied
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
        if (c.getAnio() > 0) {
            sql.append(" AND anio = :anio");
            p.addValue("anio", c.getAnio());
        }
        if (c.getMes() > 0) {
            sql.append(" AND mes = :mes");
            p.addValue("mes", c.getMes());
        }
        if (c.getDiaSemana() != null) {
            sql.append(" AND dia_semana = :dia");
            p.addValue("dia", c.getDiaSemana().name());
        }
        if (c.getFranja() != null) {
            sql.append(" AND franja = :franja");
            p.addValue("franja", c.getFranja().name());
        }

        sql.append(" ORDER BY fecha");

        return jdbc.query(sql.toString(), p, (rs, i) -> {
        Timestamp ts = rs.getTimestamp("fecha");
        String veh = rs.getString("tipo_vehiculo");
        String sev = rs.getString("severidad");
        String cli = rs.getString("clima");
        String cal = rs.getString("calzada");
        String cld = rs.getString("calidad");
        String prov = rs.getString("provincia");

        return new Sinister(
            prov == null ? null : Province.valueOf(prov),
            rs.getString("canton"),
            rs.getString("distrito"),
            rs.getString("ruta"),
            rs.getDouble("km"),
            rs.getDouble("lat"),
            rs.getDouble("lon"),
            veh == null ? null : VehycleType.valueOf(veh),
            sev == null ? null : Severity.valueOf(sev),
            cli == null ? null : Climate.valueOf(cli),
            cal == null ? null : RoadStatus.valueOf(cal),
            rs.getDouble("tiempo_respuesta_min"),
            cld == null ? null : QualityStatus.valueOf(cld),
            ts == null ? null : ts.toLocalDateTime()
        );
    });
    }
    
    public SavedFilter guardarFiltro(String nombre, FilterCriteria c, User u) {
        if (nombre == null || nombre.isBlank())
            throw new IllegalArgumentException("El nombre del filtro no puede estar vacío");
        
        SavedFilter filtro = new SavedFilter(nombre.trim(), c, u);
        
        try {
            return filtroRepo.save(filtro);
            
        } catch (DataIntegrityViolationException e) {
            throw new IllegalStateException("Ya existe un filtro llamado '" + nombre + "' para este usuario", e);
        }
    }
    
    public List<SavedFilter> getFiltrosGuardados(User u) {
        if (u == null || u.getId() == null) {
            throw new IllegalArgumentException("Usuario inexistente.");
        }
        return filtroRepo.findByUsuario(u);
    }
    
    public FilterCriteria nuevoFiltro(Province provincia, String canton, String distrito, 
                                        String ruta, int anio, int mes, Day diaSemana, TimeSlot franja, 
                                        VehycleType tipoVehiculo, Severity severidad, Climate clima, 
                                        RoadStatus calzada) {
        
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
        builder.build();
        
        return builder.getResult();
    }
}
