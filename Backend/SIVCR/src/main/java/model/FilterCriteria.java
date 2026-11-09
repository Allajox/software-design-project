package model;

import enums.VehycleType;
import enums.Gender;
import enums.Day;
import enums.RoadStatus;
import enums.TimeSlot;
import enums.Climate;
import enums.Severity;
import enums.Province;

public class FilterCriteria {
    private Province provincia;
    private String canton;
    private String distrito;
    private String ruta;
    private int anio;
    private int mes;
    private Day diaSemana; // Aqui hay una pequeña inconsistencia con la Mayuscula, el resto empiezan en minuscula en caso de que se rompiera algo fue por eso, desconozco si habia una razon detras de esto, pero lo pueden devolver si es necesario
    private TimeSlot franja;
    private VehycleType tipoVehiculo;
    private Severity severidad;
    private Climate clima;
    private RoadStatus calzada;
    private int edadMin;
    private int edadMax;
    private Gender genero;

    FilterCriteria(Province provincia, String canton, String distrito, 
            String ruta, int anio, int mes, Day diaSemana, TimeSlot franja, 
            VehycleType tipoVehiculo, Severity severidad, Climate clima, 
            RoadStatus calzada, int edadMin, int edadMax, Gender genero) {
        
        this.provincia = provincia;
        this.canton = canton;
        this.distrito = distrito;
        this.ruta = ruta;
        this.anio = anio;
        this.mes = mes;
        this.diaSemana = diaSemana;
        this.franja = franja;
        this.tipoVehiculo = tipoVehiculo;
        this.severidad = severidad;
        this.clima = clima;
        this.calzada = calzada;
        this.edadMin = edadMin;
        this.edadMax = edadMax;
        this.genero = genero;
    }

    // agregue getters para todos los campos
    public Province getProvincia() { return provincia; }
    public String getCanton() { return canton; }
    public String getDistrito() { return distrito; }
    public String getRuta() { return ruta; }
    public int getAnio() { return anio; }
    public int getMes() { return mes; }
    public Day getDiaSemana() { return diaSemana; }
    public TimeSlot getFranja() { return franja; }
    public VehycleType getTipoVehiculo() { return tipoVehiculo; }
    public Severity getSeveridad() { return severidad; }
    public Climate getClima() { return clima; }
    public RoadStatus getCalzada() { return calzada; }
    public int getEdadMin() { return edadMin; }
    public int getEdadMax() { return edadMax; }
    public Gender getGenero() { return genero; }

    @Override
    public String toString() {
        return "FilterCriteria{" + "provincia=" + provincia + ", canton=" + canton + 
                ", distrito=" + distrito + ", ruta=" + ruta + ", \nanio=" + anio + 
                ", mes=" + mes + ", diaSemana=" + diaSemana + ", franja=" + franja + 
                ", tipoVehiculo=" + tipoVehiculo + ", \nseveridad=" + severidad + 
                ", clima=" + clima + ", calzada=" + calzada + ", edadMin=" + edadMin 
                + ", edadMax=" + edadMax + ", genero=" + genero + '}';
    }
}
