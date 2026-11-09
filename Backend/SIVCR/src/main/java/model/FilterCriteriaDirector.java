package model;

import enums.Climate;
import enums.Province;
import enums.Day;
import enums.Gender;
import enums.RoadStatus;
import enums.TimeSlot;

public class FilterCriteriaDirector {

    public FilterCriteriaDirector() {}
    
    public void changeBuilder() {}
    
    public void makeUbicacion(FilterCriteriaBuilder builder, Province province, 
                                String canton, String distrito) {
        builder.setProvincia(province);
        builder.setCanton(canton);
        builder.setDistrito(distrito);
    }
    
    public void makePeriodo(FilterCriteriaBuilder builder, int anio, int mes, 
                                Day dia, TimeSlot franja) {
        builder.setAnio(anio);
        builder.setMes(mes);
        builder.setDia(dia);
        builder.setFranja(franja);
    }
    
    public void makeCondicionesAdversas(FilterCriteriaBuilder builder, 
                                Climate clima, RoadStatus calzada) {
        builder.setClima(clima);
        builder.setCalzada(calzada);
    }
}
