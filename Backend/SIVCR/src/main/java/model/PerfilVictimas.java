package model;

import java.util.List;

/**
 * Perfil de víctimas y riesgo (pantalla "Perfil de víctimas y riesgo por vehículo"). Solo cifras agregadas de las
 * personas con calidad VALIDO de la tabla victim: nunca filas individuales ni datos que identifiquen a alguien.
 * Es un record sin dependencias del framework (igual que Page y FilterCriteria).
 *
 * @param total                 personas VALIDO que cumplen los filtros
 * @param sinEdad               de ellas, las que no traen edad (COSEVI: "Desconocida"); no entran en porEdadYGenero
 * @param sinGenero             de ellas, las que no traen género o no es masculino/femenino; no entran en porEdadYGenero
 * @param porEdadYGenero        16 tramos de 5 años (0-4 ... 70-74 y 75+), siempre completos, con ceros
 * @param fatalidadPorVehiculo  un grupo por vehículo (texto de COSEVI) y uno para peatones, de mayor a menor tasa
 * @param filtrosNoAplicados    filtros del pedido que no existen en la tabla de personas y se ignoraron
 */
public record PerfilVictimas(
        long total,
        long sinEdad,
        long sinGenero,
        List<TramoEdad> porEdadYGenero,
        List<FatalidadPorVehiculo> fatalidadPorVehiculo,
        List<String> filtrosNoAplicados) {

    public PerfilVictimas {
        porEdadYGenero = List.copyOf(porEdadYGenero);
        fatalidadPorVehiculo = List.copyOf(fatalidadPorVehiculo);
        filtrosNoAplicados = List.copyOf(filtrosNoAplicados);
    }

    /** Tramo de edad. edadHasta es null en el último tramo (75 y más). */
    public record TramoEdad(String rango, int edadDesde, Integer edadHasta, long masculino, long femenino) { }

    /**
     * Fatalidad de un grupo. fallecidos = personas con "Muerte en sitio" (COSEVI no registra las muertes posteriores);
     * tasa = fallecidos / personas, entre 0 y 1.
     */
    public record FatalidadPorVehiculo(String vehiculo, long personas, long fallecidos, double tasa) { }
}
