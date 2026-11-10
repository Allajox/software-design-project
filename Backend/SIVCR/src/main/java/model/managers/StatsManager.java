package model.managers;

import enums.Day;
import enums.Gender;
import enums.TimeSlot;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import model.ConfigRepository;
import model.Etiquetas;
import model.FilterCriteria;
import model.PerfilVictimas;
import model.StatsRepository;
import model.StatsRepository.Alcance;
import model.StatsRepository.Celda;
import model.StatsRepository.Conteo;
import model.StatsRepository.Lesiones;
import model.StatsRepository.Resumen;
import model.SystemConfig;
import model.VictimRepository;
import model.dto.DashboardCharts;
import model.dto.FatalityByVehicle;
import model.dto.HeatmapData;
import model.dto.KPIResult;
import model.dto.KPIValue;
import model.dto.ParetoPoint;
import model.dto.PublicSummary;
import model.dto.VictimsByGenderAge;
import model.dto.ZoneShare;
import model.interfaces.IStatsManager;

/**
 * KPI y gráficos del dashboard (HU 9, 11 a 19). Aquí viven las fórmulas de la especificación (sección 3.4); las consultas
 * viven en app.persistence detrás de StatsRepository y VictimRepository. No depende de Spring ni de SQL.
 *
 * Reglas que se cumplen en todo el manager:
 * - Solo registros VALIDO y de la fuente de KPI (lo garantiza el repositorio). Un indicador sin datos suficientes
 *   devuelve valor null y en el ámbito dice por qué, nunca un 0 que parezca real.
 * - Edad y género son datos de la persona y COSEVI no permite enlazar una persona con su siniestro: los KPI y gráficos
 *   de siniestros los ignoran y los gráficos de personas ignoran ruta, franja, vehículo, severidad, clima y calzada.
 *   Lo ignorado se informa (en el ámbito del KPI o en DashboardCharts.filtrosNoAplicados), no se aplica en silencio.
 */
public class StatsManager implements IStatsManager {

    /** Rutas que se muestran en el Pareto y en el TSV por ruta. */
    static final int RUTAS_EN_PARETO = 15;
    static final int RUTAS_EN_TSV = 10;

    private static final String SEPARADOR = " · ";
    private static final String[] MESES = {"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
        "Septiembre", "Octubre", "Noviembre", "Diciembre"};

    private final StatsRepository estadisticas;
    private final VictimRepository victimas;
    private final ConfigRepository configuracion;

    public StatsManager(StatsRepository estadisticas, VictimRepository victimas, ConfigRepository configuracion) {
        this.estadisticas = estadisticas;
        this.victimas = victimas;
        this.configuracion = configuracion;
    }

    // ---------------------------------------------------------------------------------------------------- KPI

    @Override
    public KPIResult getKPIs(FilterCriteria filters) {
        filters.validar();
        String ambito = describeScope(filters);
        SystemConfig config = configuracion.leer();
        Resumen resumen = estadisticas.resumen(filters, config.climaAdverso(), config.calzadaAdversa());

        // TSV (3.4.1): siniestros de la zona entre el total nacional, por 100. El total nacional respeta el tiempo y
        // el resto de filtros pero no la geografía; así una provincia o una ruta se compara con el país.
        long nacional = estadisticas.contar(filters, Alcance.SIN_GEOGRAFIA);
        KPIValue tsvGlobal = nacional == 0
            ? sinDatos("%", ambito, "no hay siniestros registrados en el ámbito nacional")
            : new KPIValue(porcentaje(resumen.total(), nacional), "%", ambito);
        List<ZoneShare> porProvincia = new ArrayList<>();
        for (Conteo c : estadisticas.porProvincia(filters)) {
            porProvincia.add(new ZoneShare(Etiquetas.de(c.clave()), c.incidentes(), porcentaje(c.incidentes(), nacional)));
        }
        List<ZoneShare> porRuta = new ArrayList<>();
        for (Conteo c : primeros(estadisticas.porRuta(filters, Alcance.SIN_GEOGRAFIA), RUTAS_EN_TSV)) {
            porRuta.add(new ZoneShare(c.clave(), c.incidentes(), porcentaje(c.incidentes(), nacional)));
        }

        return new KPIResult(resumen.total(),
            new KPIResult.Tsv(tsvGlobal, nacional, porProvincia, porRuta),
            iss(filters, ambito, config),
            tpr(resumen, ambito),
            adversas(resumen, ambito));
    }

    /**
     * ISS (3.4.2) = (W1·fallecidos + W2·graves + W3·leves) / siniestros. Los siniestros de COSEVI solo distinguen
     * "con muertos o graves" de "solo heridos leves"; fallecidos, graves y leves por separado solo existen en el archivo
     * de personas. Por eso el numerador sale de las personas y el denominador de los siniestros, ambos con los filtros que
     * comparten (ubicación y tiempo), para que sean la misma población.
     */
    private KPIValue iss(FilterCriteria f, String ambito, SystemConfig config) {
        Lesiones lesiones = estadisticas.lesiones(f);
        long siniestros = estadisticas.contar(f, Alcance.COMUN_CON_PERSONAS);
        List<String> ignorados = ignoradosPorIss(f);
        String conNota = ignorados.isEmpty() ? ambito
            : ambito + SEPARADOR + "No aplicados al ISS: " + nombresVisibles(ignorados);
        if (lesiones.personas() == 0 || siniestros == 0) {
            return sinDatos("índice", conNota, "no hay personas y siniestros registrados para el ámbito");
        }
        double ponderado = config.wFallecido() * lesiones.fallecidos()
            + config.wHeridoGrave() * lesiones.graves()
            + config.wHeridoLeve() * lesiones.leves();
        return new KPIValue(ponderado / siniestros, "índice", conNota);
    }

    /**
     * TPR (3.4.3) = suma de tiempos de respuesta entre siniestros. Se divide entre los siniestros que TIENEN tiempo y
     * no entre todos: si solo algunos lo traen, dividir entre el total daría un promedio artificialmente bajo. Si todos
     * lo traen, es idéntico a la fórmula. COSEVI no registra tiempos de respuesta: hoy sale sin datos.
     */
    private static KPIValue tpr(Resumen r, String ambito) {
        if (r.total() == 0) {
            return sinDatos("min", ambito, "no hay siniestros en el ámbito");
        }
        if (r.conTiempoRespuesta() == 0) {
            return sinDatos("min", ambito, "la fuente no registra tiempos de respuesta");
        }
        String nota = r.conTiempoRespuesta() == r.total() ? ambito
            : ambito + SEPARADOR + "Promedio de los " + r.conTiempoRespuesta() + " siniestros con tiempo registrado"
                + " (de " + r.total() + ")";
        return new KPIValue(r.sumaTiempoRespuesta() / r.conTiempoRespuesta(), "min", nota);
    }

    /** IC (3.4.5): siniestros con clima o calzada adversos entre el total, por 100. */
    private static KPIValue adversas(Resumen r, String ambito) {
        return r.total() == 0
            ? sinDatos("%", ambito, "no hay siniestros en el ámbito")
            : new KPIValue(porcentaje(r.adversos(), r.total()), "%", ambito);
    }

    // ------------------------------------------------------------------------------------------------ gráficos

    @Override
    public DashboardCharts getCharts(FilterCriteria filters) {
        filters.validar();
        PerfilVictimas perfil = victimas.perfil(filters);

        List<String> edades = new ArrayList<>();
        List<Long> masculino = new ArrayList<>();
        List<Long> femenino = new ArrayList<>();
        for (PerfilVictimas.TramoEdad tramo : perfil.porEdadYGenero()) {
            edades.add(tramo.rango());
            masculino.add(tramo.masculino());
            femenino.add(tramo.femenino());
        }
        VictimsByGenderAge victims = new VictimsByGenderAge(edades, List.of(
            new VictimsByGenderAge.Series(Etiquetas.de(Gender.MASCULINO), masculino),
            new VictimsByGenderAge.Series(Etiquetas.de(Gender.FEMENINO), femenino)));

        // TF_v (3.4.4): fallecidos entre personas de cada vehículo, por 100. Con personas, no con siniestros: la tasa es
        // por persona (no "siniestros con al menos un fallecido"), porque el archivo de personas no dice a qué siniestro
        // pertenecen. Los vehículos son los de COSEVI, sin agrupar.
        List<FatalityByVehicle> fatalidad = new ArrayList<>();
        for (PerfilVictimas.FatalidadPorVehiculo g : perfil.fatalidadPorVehiculo()) {
            fatalidad.add(new FatalityByVehicle(g.vehiculo(), g.personas(), g.fallecidos(), g.tasa() * 100));
        }

        LinkedHashSet<String> noAplicados = new LinkedHashSet<>(ignoradosPorSiniestros(filters));
        noAplicados.addAll(perfil.filtrosNoAplicados());
        return new DashboardCharts(getHeatmap(filters), getPareto(filters), victims, fatalidad,
            new ArrayList<>(noAplicados));
    }

    @Override
    public HeatmapData getHeatmap(FilterCriteria filters) {
        filters.validar();
        List<String> dias = new ArrayList<>();
        for (Day d : Day.values()) {
            dias.add(Etiquetas.de(d));
        }
        List<String> franjas = new ArrayList<>();
        for (TimeSlot t : TimeSlot.values()) {
            franjas.add(Etiquetas.de(t));
        }
        int[][] z = new int[dias.size()][franjas.size()];
        for (Celda celda : estadisticas.mapaDeCalor(filters)) {
            try {
                z[Day.valueOf(celda.dia()).ordinal()][TimeSlot.valueOf(celda.franja()).ordinal()] =
                    Math.toIntExact(celda.incidentes());
            } catch (IllegalArgumentException e) {
                // un día o una franja que el enum no conoce no tiene casilla: se omite en vez de tumbar el gráfico
            }
        }
        return new HeatmapData(dias, franjas, z);
    }

    /** Pareto: las rutas con más siniestros; el acumulado es sobre TODAS las rutas numeradas, no solo las mostradas. */
    @Override
    public List<ParetoPoint> getPareto(FilterCriteria filters) {
        filters.validar();
        List<Conteo> rutas = estadisticas.porRuta(filters, Alcance.COMPLETO);
        long total = rutas.stream().mapToLong(Conteo::incidentes).sum();
        List<ParetoPoint> pareto = new ArrayList<>();
        long acumulado = 0;
        for (Conteo ruta : primeros(rutas, RUTAS_EN_PARETO)) {
            acumulado += ruta.incidentes();
            pareto.add(new ParetoPoint(ruta.clave(), ruta.incidentes(), porcentaje(acumulado, total)));
        }
        return pareto;
    }

    // ---------------------------------------------------------------------------------------------- consultor

    /** Solo agregados nacionales de siniestros: sin datos de personas y sin los filtros del cliente. */
    @Override
    public PublicSummary getPublicSummary() {
        FilterCriteria sinFiltros = FilterCriteria.vacio();
        long total = estadisticas.contar(sinFiltros, Alcance.COMPLETO);
        List<PublicSummary.ProvinceCount> provincias = new ArrayList<>();
        for (Conteo c : estadisticas.porProvincia(sinFiltros)) {
            provincias.add(new PublicSummary.ProvinceCount(Etiquetas.de(c.clave()), c.incidentes()));
        }
        List<PublicSummary.YearCount> anios = new ArrayList<>();
        for (Conteo c : estadisticas.porAnio(sinFiltros)) {
            anios.add(new PublicSummary.YearCount(Integer.parseInt(c.clave()), c.incidentes()));
        }

        // El TSV público es el de la provincia con más siniestros: con todo el país el TSV sería siempre 100 %
        String principal = provincias.isEmpty() ? null : provincias.get(0).province();
        KPIValue tsv = principal == null || total == 0
            ? sinDatos("%", "Todo el país", "no hay siniestros registrados")
            : new KPIValue(porcentaje(provincias.get(0).incidents(), total), "%",
                "Provincia con más siniestros: " + principal);
        return new PublicSummary(total, tsv, principal, provincias, anios);
    }

    // ------------------------------------------------------------------------------------------------ ámbito

    /** "Provincia: San José · Año: 2023 · Franja: Noche"; sin filtros, "Sin filtros (todos los registros válidos)". */
    @Override
    public String describeScope(FilterCriteria f) {
        List<String> partes = new ArrayList<>();
        if (f.provincia() != null) partes.add("Provincia: " + Etiquetas.de(f.provincia()));
        if (f.canton() != null) partes.add("Cantón: " + f.canton());
        if (f.distrito() != null) partes.add("Distrito: " + f.distrito());
        if (f.ruta() != null) partes.add("Ruta: " + f.ruta());
        if (f.anio() != null) partes.add("Año: " + f.anio());
        if (f.mes() != null) partes.add("Mes: " + (f.mes() >= 1 && f.mes() <= 12 ? MESES[f.mes() - 1] : f.mes()));
        if (f.diaSemana() != null) partes.add("Día: " + Etiquetas.de(f.diaSemana()));
        if (f.franja() != null) partes.add("Franja: " + Etiquetas.de(f.franja()));
        if (f.tipoVehiculo() != null) partes.add("Vehículo: " + Etiquetas.de(f.tipoVehiculo()));
        if (f.severidad() != null) partes.add("Severidad: " + Etiquetas.de(f.severidad()));
        if (f.clima() != null) partes.add("Clima: " + Etiquetas.de(f.clima()));
        if (f.calzada() != null) partes.add("Calzada: " + Etiquetas.de(f.calzada()));
        if (f.edadMin() != null && f.edadMax() != null) partes.add("Edad: " + f.edadMin() + "-" + f.edadMax());
        else if (f.edadMin() != null) partes.add("Edad: desde " + f.edadMin());
        else if (f.edadMax() != null) partes.add("Edad: hasta " + f.edadMax());
        if (f.genero() != null) partes.add("Género: " + Etiquetas.de(f.genero()));
        return partes.isEmpty() ? "Sin filtros (todos los registros válidos)" : String.join(SEPARADOR, partes);
    }

    // ------------------------------------------------------------------------------------------------ apoyo

    private static KPIValue sinDatos(String unidad, String ambito, String motivo) {
        return new KPIValue(null, unidad, ambito + SEPARADOR + "Sin datos: " + motivo);
    }

    private static double porcentaje(long parte, long total) {
        return total == 0 ? 0 : 100.0 * parte / total;
    }

    private static <T> List<T> primeros(List<T> lista, int cantidad) {
        return lista.size() <= cantidad ? lista : lista.subList(0, cantidad);
    }

    /** Filtros del pedido que los datos de siniestros no tienen (son de la persona). */
    private static List<String> ignoradosPorSiniestros(FilterCriteria f) {
        List<String> nombres = new ArrayList<>();
        if (f.edadMin() != null || f.edadMax() != null) nombres.add("edad");
        if (f.genero() != null) nombres.add("genero");
        return nombres;
    }

    /** Filtros del pedido que el ISS no aplica: todos los que no existen a la vez en siniestros y en personas. */
    private static List<String> ignoradosPorIss(FilterCriteria f) {
        List<String> nombres = new ArrayList<>();
        if (f.ruta() != null) nombres.add("ruta");
        if (f.franja() != null) nombres.add("franja");
        if (f.tipoVehiculo() != null) nombres.add("tipoVehiculo");
        if (f.severidad() != null) nombres.add("severidad");
        if (f.clima() != null) nombres.add("clima");
        if (f.calzada() != null) nombres.add("calzada");
        nombres.addAll(ignoradosPorSiniestros(f));
        return nombres;
    }

    private static String nombresVisibles(List<String> nombres) {
        List<String> visibles = new ArrayList<>();
        for (String nombre : nombres) {
            visibles.add(switch (nombre) {
                case "tipoVehiculo" -> "tipo de vehículo";
                case "genero" -> "género";
                default -> nombre;
            });
        }
        return String.join(", ", visibles);
    }
}
