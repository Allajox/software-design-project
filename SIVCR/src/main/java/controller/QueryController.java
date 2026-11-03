package controller;

import java.util.ArrayList;
import model.QueryHistory;
import java.util.List;
import model.FilterCriteria;
import model.SavedFilter;
import model.User;

public class QueryController {
    private FilterManager filterManager = new FilterManager();
    
    public QueryController() {}
    
    public SavedFilter guardarFiltro(String nombre, FilterCriteria criterio, User u) {
        return filterManager.guardarFiltro(nombre, criterio, u);
    }
    
    public List<QueryHistory> getHistorial() {
        // To-do
        List<QueryHistory> list = new ArrayList<>();
        return list;
    }
    
    // To-do
    /*
    public FilterCriteria reejecutar(Long idConsulta) {
        
    }
    */
    
    public List<SavedFilter> getFiltrosGuardados() {
        // To-do
        List<SavedFilter> list = new ArrayList<>();
        return list;
    }
}
