package model;

import java.util.List;
import java.util.Set;
import model.StatsRepository.Celda;
import model.StatsRepository.Conteo;
import model.StatsRepository.Lesiones;
import model.StatsRepository.Resumen;
import model.dto.DashboardFilters;

/**
 * Puerto de las agregaciones del panel del dashboard (GET /api/dashboard), que filtra con DashboardFilters: varios
 * valores por filtro y las etiquetas del frontend. Hermano de StatsRepository (que filtra con FilterCriteria). Igual que
 * él, solo cuenta registros VALIDO y, en siniestros, solo los de la fuente de los KPI (COSEVI: INEC también guarda
 * fallecidos como siniestros y se contarían dos veces). Devuelve cifras agregadas, nunca filas. La implementación vive
 * en app.persistence; las fórmulas viven en DashboardManager.
 *
 * Los filtros se reparten entre las dos tablas igual que en Filtros: ubicación y tiempo existen en siniestros y en
 * personas; ruta, franja, clima, calzada y severidad solo en siniestros; vehículo, edad y género solo en personas
 * (COSEVI no permite enlazar una persona con su siniestro).
 */
public interface DashboardRepository {

    /** Nombres con los que se indica qué filtro de siniestros una consulta deja de aplicar. */
    String PROVINCIA = "provincia";
    String CANTON = "canton";
    String DISTRITO = "distrito";
    String RUTA = "ruta";
    String ANIOS = "anios";
    String MESES = "meses";
    String DIAS = "dias";
    String FRANJAS = "franjas";
    String CLIMAS = "climas";
    String CALZADAS = "calzadas";
    String SEVERIDADES = "severidades";

    /** La geografía: contra el total nacional se compara una zona. */
    Set<String> GEOGRAFIA = Set.of(PROVINCIA, CANTON, DISTRITO, RUTA);

    /** Lo que los siniestros comparten con las personas: se ignora el resto (ruta, franja, clima, calzada, severidad). */
    Set<String> NO_COMPARTIDOS_CON_PERSONAS = Set.of(RUTA, FRANJAS, CLIMAS, CALZADAS, SEVERIDADES);

    /** Columnas de siniestros por las que se puede agrupar. */
    enum Columna {
        PROVINCIA("provincia"), SEVERIDAD("severidad"), ANIO("anio"), FRANJA("franja");

        public final String sql;

        Columna(String sql) {
            this.sql = sql;
        }
    }

    /**
     * Personas de un grupo de vehículo (los peatones aparte) y cuántas murieron en el sitio.
     * @param vehiculo  "Peatón", "Sin dato" o el texto de COSEVI del vehículo en el que viajaba
     */
    record PersonasPorVehiculo(String vehiculo, long personas, long fallecidos) { }

    /** Personas de un rango de edad ("18-25", "26-40", "41-60", ">60") y un género (MASCULINO o FEMENINO). */
    record PersonasPorEdadYGenero(String rangoEdad, String genero, long personas) { }

    /** Una combinación de provincia (valor guardado, p. ej. SAN_JOSE), cantón y distrito que existe en los datos. */
    record Ubicacion(String provincia, String canton, String distrito) { }

    /** Siniestros con los filtros, menos los que se nombran en ignorar. */
    long contarSiniestros(DashboardFilters filtros, Set<String> ignorar);

    /** Totales de siniestros con todos los filtros; clima y calzada adversos vienen de la configuración. */
    Resumen resumenSiniestros(DashboardFilters filtros, Set<String> climaAdverso, Set<String> calzadaAdversa);

    /** Siniestros por columna (la clave es el valor guardado), sin los filtros que se nombran en ignorar. */
    List<Conteo> siniestrosPor(Columna columna, DashboardFilters filtros, Set<String> ignorar);

    /** Siniestros por número de ruta nacional (excluye "Cantonal" e "Ignorada"), de mayor a menor, sin el filtro de ruta. */
    List<Conteo> siniestrosPorRuta(DashboardFilters filtros);

    /** Siniestros por día de la semana y franja horaria, con todos los filtros. */
    List<Celda> siniestrosPorDiaYFranja(DashboardFilters filtros);

    /**
     * Personas por tipo de lesión. Con soloComunes, solo ubicación y tiempo (la población que comparten con los
     * siniestros); si no, también edad, género y vehículo.
     */
    Lesiones personasPorLesion(DashboardFilters filtros, boolean soloComunes);

    /** Personas por grupo de vehículo con los filtros de personas, sin el de vehículo. Sin límite: ordena el manager. */
    List<PersonasPorVehiculo> personasPorVehiculo(DashboardFilters filtros);

    /** Personas por rango de edad y género con los filtros de personas; las de edad fuera de los rangos no cuentan. */
    List<PersonasPorEdadYGenero> personasPorEdadYGenero(DashboardFilters filtros);

    // ---- Catálogos de las listas de filtros (sin filtros: lo que existe en los datos)

    /** Provincia, cantón y distrito de los siniestros de la fuente de los KPI. */
    List<Ubicacion> ubicaciones();

    /** Rutas nacionales con siniestros, como se guardan ("1", "27"), en orden numérico. */
    List<String> rutasNacionales();

    /** Años con siniestros, de menor a mayor. */
    List<Integer> anios();

    /** Textos de vehículo de las personas, sin vacíos ni "No aplica". */
    List<String> vehiculos();
}
