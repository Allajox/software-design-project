package controller;

import enums.Climate;
import enums.Day;
import enums.Gender;
import enums.Province;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import java.util.ArrayList;
import java.util.List;
import model.ConcreteFilterCriteriaBuilder;
import model.FilterCriteriaDirector;
import model.FilterCriteria;
import model.Sinister;
import model.SavedFilter;
import model.User;

public class FilterManager {
    private ConcreteFilterCriteriaBuilder builder = new ConcreteFilterCriteriaBuilder();
    
    //private Repository<Sinister> sinisterRepo;
    //private Repository<SavedFilter> filtroRepo;
    
    public FilterManager() {}
    /*
    public List<Sinister> aplicar(FilterCriteria c) {
        // To-do
        List<Sinister> list = new ArrayList<Sinister>();
        return list;
    }
    
    public Page<Sinister> getRegistros(FilterCriteria c, int pagina, String orden) {
        // To-do
        return c;
    }
    */
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
