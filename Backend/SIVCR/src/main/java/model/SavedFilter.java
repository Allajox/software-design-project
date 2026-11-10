package model;

public class SavedFilter {
    private Long id;
    private String nombre;
    private FilterCriteria criterio;
    private User usuario;

    public SavedFilter(String nombre, FilterCriteria criterio, User usuario) {
        this.nombre = nombre;
        this.criterio = criterio;
        this.usuario = usuario;
    }

    public long getId() {
        return id;
    }

    public String getNombre() {
        return nombre;
    }

    public FilterCriteria getCriterio() {
        return criterio;
    }

    public User getUsuario() {
        return usuario;
    }
    
    public void setId(long id) {
        this.id = id;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }

    public void setCriterio(FilterCriteria criterio) {
        this.criterio = criterio;
    }

    public void setUsuario(User usuario) {
        this.usuario = usuario;
    }

    @Override
    public String toString() {
        return "SavedFilter{" + "id=" + id + ", nombre=" + nombre + ", criterio=" + criterio + ", usuario=" + usuario + '}';
    }
}
