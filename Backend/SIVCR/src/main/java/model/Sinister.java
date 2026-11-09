package model;

import java.time.LocalDateTime;
import enums.Province;
import enums.Climate;
import enums.Gender;
import enums.QualityStatus;
import enums.RoadStatus;
import enums.Severity;
import enums.VehycleType;
import enums.VictimCondition;

public class Sinister {
    private Province provincia;
    private String canton;
    private String distrito;
    private String ruta;
    private double km;
    private double lat;
    private double length;
    private VehycleType tipoVehiculo;
    private Severity severidad;
    private Climate clima;
    private RoadStatus calzada;
    private double tiempoRespuestaMins;
    private QualityStatus calidad;
    private LocalDateTime fecha;
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
}
