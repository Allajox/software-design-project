package model;

import java.time.LocalDateTime;
import enums.Province;
import enums.Climate;
import enums.Day;
import enums.Gender;
import enums.QualityStatus;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import enums.VictimCondition;

public class Sinister {
    private Province provincia;
    private String canton;
    private String distrito;
    private String ruta;
    // Double (no double): COSEVI no trae kilómetro exacto, coordenadas ni tiempo de respuesta, y null != 0
    private Double km;
    private Double lat;
    private Double length;
    private VehycleType tipoVehiculo;
    private Severity severidad;
    private Climate clima;
    private RoadStatus calzada;
    private Double tiempoRespuestaMins;
    private QualityStatus calidad;
    private LocalDateTime fecha;
    // COSEVI no trae fecha exacta: trae año, mes, día de la semana y franja, y son lo que muestra la tabla
    private Integer anio;
    private Integer mes;
    private Day diaSemana;
    private TimeSlot franja;
    private Victim victima;

    public Sinister(Province provincia, String canton, String distrito, String ruta, 
                    double km, double lat, double length, VehycleType tipoVehiculo, 
                    Severity severidad, Climate clima, RoadStatus calzada, 
                    double tiempoRespuestaMins, QualityStatus calidad, LocalDateTime fecha) {
        this.provincia = provincia;
        this.canton = canton;
        this.distrito = distrito;
        this.ruta = ruta;
        this.km = km;
        this.lat = lat;
        this.length = length;
        this.tipoVehiculo = tipoVehiculo;
        this.severidad = severidad;
        this.clima = clima;
        this.calzada = calzada;
        this.tiempoRespuestaMins = tiempoRespuestaMins;
        this.calidad = calidad;
        this.fecha = fecha;
    }

    /**
     * Siniestro leído de la tabla sinister, sin víctima: COSEVI no permite enlazar personas con siniestros.
     * Los campos que la fuente no trae quedan en null.
     */
    public Sinister(Province provincia, String canton, String distrito, String ruta,
                    Double km, Double lat, Double length, VehycleType tipoVehiculo,
                    Severity severidad, Climate clima, RoadStatus calzada,
                    Double tiempoRespuestaMins, QualityStatus calidad, LocalDateTime fecha,
                    Integer anio, Integer mes, Day diaSemana, TimeSlot franja) {
        this.provincia = provincia;
        this.canton = canton;
        this.distrito = distrito;
        this.ruta = ruta;
        this.km = km;
        this.lat = lat;
        this.length = length;
        this.tipoVehiculo = tipoVehiculo;
        this.severidad = severidad;
        this.clima = clima;
        this.calzada = calzada;
        this.tiempoRespuestaMins = tiempoRespuestaMins;
        this.calidad = calidad;
        this.fecha = fecha;
        this.anio = anio;
        this.mes = mes;
        this.diaSemana = diaSemana;
        this.franja = franja;
        this.victima = null;
    }

    public Province getProvincia() {
        return provincia;
    }

    public String getCanton() {
        return canton;
    }

    public String getDistrito() {
        return distrito;
    }

    public String getRuta() {
        return ruta;
    }

    public Double getKm() {
        return km;
    }

    public Double getLat() {
        return lat;
    }

    /** Longitud (el atributo se llama "length" en el diagrama de clases). */
    public Double getLon() {
        return length;
    }

    public VehycleType getTipoVehiculo() {
        return tipoVehiculo;
    }

    public Severity getSeveridad() {
        return severidad;
    }

    public Climate getClima() {
        return clima;
    }

    public RoadStatus getCalzada() {
        return calzada;
    }

    public Double getTiempoRespuestaMins() {
        return tiempoRespuestaMins;
    }

    public QualityStatus getCalidad() {
        return calidad;
    }

    public LocalDateTime getFecha() {
        return fecha;
    }

    public Integer getAnio() {
        return anio;
    }

    public Integer getMes() {
        return mes;
    }

    public Day getDiaSemana() {
        return diaSemana;
    }

    public TimeSlot getFranja() {
        return franja;
    }

    /** null cuando la fuente no permite enlazar una víctima al siniestro (COSEVI). */
    public Victim getVictima() {
        return victima;
    }
}
