package model;

import java.util.List;
import java.util.Set;

/**
 * Puerto de las agregaciones del dashboard (KPI y gráficos). Solo cuenta registros VALIDO y, en siniestros, solo los
 * de la fuente de los KPI (COSEVI: INEC también guarda fallecidos como siniestros y se contarían dos veces). Devuelve
 * cifras agregadas, nunca filas. La implementación vive en app.persistence; las fórmulas viven en StatsManager.
 */
public interface StatsRepository {

    /** Qué parte de los filtros de siniestros se aplica en una consulta. */
    enum Alcance {
        /** Todos los filtros de siniestros. */
        COMPLETO,
        /** Sin provincia, cantón, distrito ni ruta: el total nacional contra el que se compara una zona. */
        SIN_GEOGRAFIA,
        /** Solo ubicación (provincia, cantón, distrito) y tiempo: lo que también existe en la tabla de personas. */
        COMUN_CON_PERSONAS
    }

    /**
     * Totales de los siniestros con todos los filtros.
     * @param total                 siniestros
     * @param conTiempoRespuesta    de ellos, los que traen tiempo de respuesta
     * @param sumaTiempoRespuesta   suma de esos tiempos, en minutos
     * @param adversos              los que ocurrieron con un clima o una calzada de la lista de condiciones adversas
     */
    record Resumen(long total, long conTiempoRespuesta, double sumaTiempoRespuesta, long adversos) { }

    /** Cantidad de siniestros de una clave (nombre de provincia, número de ruta o año). */
    record Conteo(String clave, long incidentes) { }

    /** Cantidad de siniestros de un día de la semana (nombre del enum Day) y una franja (nombre del enum TimeSlot). */
    record Celda(String dia, String franja, long incidentes) { }

    /**
     * Personas por tipo de lesión.
     * @param personas    todas las personas VALIDO del alcance (incluye ilesos)
     * @param fallecidos  "Muerte en sitio" (COSEVI no registra las muertes posteriores)
     */
    record Lesiones(long personas, long fallecidos, long graves, long leves) { }

    /** Totales de siniestros con todos los filtros; clima y calzada adversos vienen de la configuración. */
    Resumen resumen(FilterCriteria criterios, Set<String> climaAdverso, Set<String> calzadaAdversa);

    /** Cuántos siniestros hay en el alcance indicado. */
    long contar(FilterCriteria criterios, Alcance alcance);

    /** Siniestros por provincia, sin los filtros de geografía (siempre el panorama nacional), de mayor a menor. */
    List<Conteo> porProvincia(FilterCriteria criterios);

    /** Siniestros por número de ruta nacional (excluye "Cantonal" e "Ignorada"), de mayor a menor. */
    List<Conteo> porRuta(FilterCriteria criterios, Alcance alcance);

    /** Siniestros por día de la semana y franja horaria, con todos los filtros. */
    List<Celda> mapaDeCalor(FilterCriteria criterios);

    /** Siniestros por año, con todos los filtros, del más antiguo al más reciente. */
    List<Conteo> porAnio(FilterCriteria criterios);

    /** Personas por tipo de lesión, con ubicación y tiempo (la población que comparte con los siniestros). */
    Lesiones lesiones(FilterCriteria criterios);
}
