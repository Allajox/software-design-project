package model;

public class SavedFilter {
    private String nombre;
    private FilterCriteria criterio;
    private User usuario;

    public SavedFilter(String nombre, FilterCriteria criterio, User usuario) {
        this.nombre = nombre;
        this.criterio = criterio;
        this.usuario = usuario;
    }

    @Override
    public String toString() {
        return "SavedFilter{" + "nombre=" + nombre + 
                ", criterio=" + criterio + ", usuario=" + usuario.getName() + '}';
    }
}
