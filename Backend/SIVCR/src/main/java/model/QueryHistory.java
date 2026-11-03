package model;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class QueryHistory {
    private LocalDateTime fecha;
    private String resumen;
    private FilterCriteria criterio;
    private User usuario;
    
    public QueryHistory(String resumen, FilterCriteria criterio, User usuario) {
        this.fecha = LocalDateTime.now();
        this.resumen = resumen;
        this.criterio = criterio;
        this.usuario = usuario;
    }
    
    @Override
    public String toString() {
        return "QueryHistory{" + "fecha=" + fecha + ", resumen=" + resumen + 
                ", criterio=" + criterio + ", usuario=" + usuario + '}';
    }
}
