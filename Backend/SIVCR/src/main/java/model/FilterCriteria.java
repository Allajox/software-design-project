package model;

import enums.Climate;
import enums.Day;
import enums.Gender;
import enums.Province;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;

/**
 * Criterios de filtro (HU 6-10). Un valor nulo significa "sin filtro"; el texto en blanco y el 0 también, así que
 * se normalizan a null (dos filtros equivalentes son iguales). Es un record sin anotaciones ni dependencias del
 * framework, y es a la vez el cuerpo JSON de las solicitudes y lo que se guarda en saved_filter y query_history.
 * Se arma con ConcreteFilterCriteriaBuilder (o desde JSON) y se valida con validar().
 */
public record FilterCriteria(
        Province provincia, String canton, String distrito, String ruta,
        Integer anio, Integer mes, Day diaSemana, TimeSlot franja,
        VehycleType tipoVehiculo, Severity severidad, Climate clima, RoadStatus calzada,
        Integer edadMin, Integer edadMax, Gender genero) {

    public FilterCriteria {
        canton = textoONulo(canton);
        distrito = textoONulo(distrito);
        ruta = textoONulo(ruta);
        anio = ceroONulo(anio);
        mes = ceroONulo(mes);
        edadMin = ceroONulo(edadMin);
        edadMax = ceroONulo(edadMax);
    }

    public static FilterCriteria vacio() {
        return new FilterCriteria(null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null);
    }

    /** true si no trae ningún filtro. */
    public boolean estaVacio() {
        return equals(vacio());
    }

    /** Valida los rangos; lanza FiltroInvalidoException con un mensaje legible. Devuelve este mismo filtro. */
    public FilterCriteria validar() {
        if (anio != null && (anio < 1900 || anio > 2100)) {
            throw new FiltroInvalidoException("El año debe estar entre 1900 y 2100.");
        }
        if (mes != null && (mes < 1 || mes > 12)) {
            throw new FiltroInvalidoException("El mes debe estar entre 1 y 12.");
        }
        if ((edadMin != null && edadMin < 0) || (edadMax != null && edadMax < 0)) {
            throw new FiltroInvalidoException("La edad no puede ser negativa.");
        }
        if (edadMin != null && edadMax != null && edadMin > edadMax) {
            throw new FiltroInvalidoException("La edad mínima no puede ser mayor que la edad máxima.");
        }
        return this;
    }

    // ---- Compatibilidad con SqlFilter y StatsManager (bloque de KPI) ----
    // Esas clases leen los criterios con getters y tratan 0 como «sin filtro» en año, mes y edades; aquí los valores
    // nulos del record se entregan como 0 para que sigan funcionando sin tocarlas. El resto de código usa los
    // accesores del record (provincia(), anio()…). Efecto en el JSON: Jackson prefiere getX() sobre el accesor del
    // record, así que anio, mes, edadMin y edadMax se serializan como 0 (no null) cuando no hay filtro; al leerlos,
    // el constructor del record vuelve a normalizar 0 a null, de modo que la ida y vuelta es idéntica.

    public Province getProvincia() { return provincia; }
    public String getCanton() { return canton; }
    public String getDistrito() { return distrito; }
    public String getRuta() { return ruta; }
    public int getAnio() { return anio == null ? 0 : anio; }
    public int getMes() { return mes == null ? 0 : mes; }
    public Day getDiaSemana() { return diaSemana; }
    public TimeSlot getFranja() { return franja; }
    public VehycleType getTipoVehiculo() { return tipoVehiculo; }
    public Severity getSeveridad() { return severidad; }
    public Climate getClima() { return clima; }
    public RoadStatus getCalzada() { return calzada; }
    public int getEdadMin() { return edadMin == null ? 0 : edadMin; }
    public int getEdadMax() { return edadMax == null ? 0 : edadMax; }
    public Gender getGenero() { return genero; }

    private static String textoONulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.trim();
    }

    private static Integer ceroONulo(Integer valor) {
        return valor == null || valor == 0 ? null : valor;
    }
}
