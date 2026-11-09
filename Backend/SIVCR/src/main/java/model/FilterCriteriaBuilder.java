package model;

import enums.VehycleType;
import enums.Gender;
import enums.Day;
import enums.RoadStatus;
import enums.TimeSlot;
import enums.Climate;
import enums.Severity;
import enums.Province;

public interface FilterCriteriaBuilder {
    void setProvincia(Province p);
    
    void setCanton(String c);
    
    void setDistrito(String d);
    
    void setRuta(String r);
    
    void setAnio(int a);
    
    void setMes(int m);
    
    void setDia(Day d);
    
    void setFranja(TimeSlot f);
    
    void setVehiculo(VehycleType v);
    
    void setSeveridad(Severity s);
    
    void setClima(Climate c);
    
    void setCalzada(RoadStatus c);
    
    void reset();
    
    void build();
}
