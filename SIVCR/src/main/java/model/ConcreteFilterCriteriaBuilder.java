package model;

import enums.Climate;
import enums.Day;
import enums.Gender;
import enums.Province;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;

public class ConcreteFilterCriteriaBuilder implements FilterCriteriaBuilder {
    private FilterCriteria filtro;
    
    private Province provincia;
    private String canton;
    private String distrito;
    private String ruta;
    private int anio;
    private int mes;
    private Day diaSemana;
    private TimeSlot franja;
    private VehycleType tipoVehiculo;
    private Severity severidad;
    private Climate clima;
    private RoadStatus calzada;
    private int edadMin;
    private int edadMax;
    private Gender genero;
    
    public ConcreteFilterCriteriaBuilder() {}
    
    @Override
    public void setProvincia(Province p) {
        this.provincia = p;
    }
    
    @Override
    public void setCanton(String c) {
        this.canton = c;
    }
    
    @Override
    public void setDistrito(String d) {
        this.distrito = d;
    }
    
    @Override
    public void setRuta(String r) {
        this.ruta = r;
    }
    
    @Override
    public void setAnio(int a) {
        this.anio = a;
    }
    
    @Override
    public void setMes(int m) {
        this.mes = m;
    }
    
    @Override
    public void setDia(Day d) {
        this.diaSemana = d;
    }
    
    @Override
    public void setFranja(TimeSlot f) {
        this.franja = f;
    }
    
    @Override
    public void setVehiculo(VehycleType v) {
        this.tipoVehiculo = v;
    }
    
    @Override
    public void setSeveridad(Severity s) {
        this.severidad = s;
    }
    
    @Override
    public void setClima(Climate c) {
        this.clima = c;
    }
    
    @Override
    public void setCalzada(RoadStatus c) {
        this.calzada = c;
    }
    
    @Override
    public void setEdad(int min, int max) {
        this.edadMin = min;
        this.edadMax = max;
    }
    
    @Override
    public void setGenero(Gender g) {
        this.genero = g;
    }
    
    @Override
    public void reset() {
        this.filtro = new FilterCriteria(null, null, null, null, 0, 0, null,
                                         null, null, null, null, null, 0, 0, null);
    }
    
    @Override
    public void build() {
        this.filtro = new FilterCriteria(provincia, canton, distrito, ruta, anio, mes, diaSemana,
                    franja, tipoVehiculo, severidad, clima, calzada, edadMin, edadMax, genero);
    }
    
    public FilterCriteria getResult() {
        FilterCriteria result = this.filtro;
        this.reset();
        return result;
    }
}
