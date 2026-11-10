package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.Climate;
import enums.Gender;
import enums.Province;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import model.ConfigRepository;
import model.FilterCriteria;
import model.FiltroInvalidoException;
import model.PerfilVictimas;
import model.PerfilVictimas.FatalidadPorVehiculo;
import model.PerfilVictimas.TramoEdad;
import model.StatsRepository;
import model.SystemConfig;
import model.VictimRepository;
import model.dto.DashboardCharts;
import model.dto.HeatmapData;
import model.dto.KPIResult;
import model.dto.ParetoPoint;
import model.dto.PublicSummary;
import org.junit.jupiter.api.Test;

/** Fórmulas de los KPI y arma de gráficos sin base de datos ni Spring (rápida; corre con "mvn test"). */
class StatsManagerTest {

    /** Repositorio de estadísticas con respuestas fijas; guarda con qué alcance le preguntaron. */
    private static class EstadisticasFijas implements StatsRepository {
        Resumen resumen = new Resumen(0, 0, 0, 0);
        long nacional = 0;
        long comunes = 0;
        List<Conteo> provincias = List.of();
        List<Conteo> rutasNacionales = List.of();
        List<Conteo> rutasFiltradas = List.of();
        List<Celda> celdas = List.of();
        List<Conteo> anios = List.of();
        Lesiones lesiones = new Lesiones(0, 0, 0, 0);
        Set<String> climaRecibido;
        Set<String> calzadaRecibida;

        @Override public Resumen resumen(FilterCriteria c, Set<String> clima, Set<String> calzada) {
            climaRecibido = clima;
            calzadaRecibida = calzada;
            return resumen;
        }
        @Override public long contar(FilterCriteria c, Alcance alcance) {
            return switch (alcance) {
                case COMPLETO -> resumen.total();
                case SIN_GEOGRAFIA -> nacional;
                case COMUN_CON_PERSONAS -> comunes;
            };
        }
        @Override public List<Conteo> porProvincia(FilterCriteria c) { return provincias; }
        @Override public List<Conteo> porRuta(FilterCriteria c, Alcance alcance) {
            return alcance == Alcance.SIN_GEOGRAFIA ? rutasNacionales : rutasFiltradas;
        }
        @Override public List<Celda> mapaDeCalor(FilterCriteria c) { return celdas; }
        @Override public List<Conteo> porAnio(FilterCriteria c) { return anios; }
        @Override public Lesiones lesiones(FilterCriteria c) { return lesiones; }
    }

    private static class VictimasFijas implements VictimRepository {
        PerfilVictimas perfil = new PerfilVictimas(0, 0, 0, List.of(), List.of(), List.of());
        @Override public PerfilVictimas perfil(FilterCriteria c) { return perfil; }
    }

    private final EstadisticasFijas estadisticas = new EstadisticasFijas();
    private final VictimasFijas victimas = new VictimasFijas();
    private SystemConfig config = new SystemConfig(10, 5, 1, Set.of("LLUVIA"), Set.of("RESBALADIZA"));
    private final StatsManager manager = new StatsManager(estadisticas, victimas, () -> config);

    private static FilterCriteria sinFiltros() {
        return FilterCriteria.vacio();
    }

    private static FilterCriteria conProvincia(Province p) {
        return new FilterCriteria(p, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null);
    }

    // ---- TSV ----

    @Test
    void laTsvEsLaParteDelTotalNacionalPorCien() {
        estadisticas.resumen = new StatsRepository.Resumen(250, 0, 0, 0);
        estadisticas.nacional = 1000;
        estadisticas.provincias = List.of(new StatsRepository.Conteo("SAN_JOSE", 400),
                new StatsRepository.Conteo("LIMON", 100));
        estadisticas.rutasNacionales = List.of(new StatsRepository.Conteo("2", 300),
                new StatsRepository.Conteo("1", 200));

        KPIResult kpis = manager.getKPIs(conProvincia(Province.LIMON));

        assertEquals(250, kpis.totalRecords());
        assertEquals(25.0, kpis.tsv().global().value(), 1e-9);
        assertEquals("%", kpis.tsv().global().unit());
        assertEquals("Provincia: Limón", kpis.tsv().global().scope());
        assertEquals(1000, kpis.tsv().nationalTotal());
        assertEquals("San José", kpis.tsv().byProvince().get(0).zone());
        assertEquals(40.0, kpis.tsv().byProvince().get(0).percentOfNational(), 1e-9);
        assertEquals("Limón", kpis.tsv().byProvince().get(1).zone());
        assertEquals("2", kpis.tsv().byRoute().get(0).zone());
        assertEquals(30.0, kpis.tsv().byRoute().get(0).percentOfNational(), 1e-9);
    }

    @Test
    void sinSiniestrosEnElPaisLaTsvNoSeInventa() {
        KPIResult kpis = manager.getKPIs(sinFiltros());
        assertNull(kpis.tsv().global().value());
        assertTrue(kpis.tsv().global().scope().contains("Sin datos"), kpis.tsv().global().scope());
        assertNull(kpis.adverseConditionsPct().value());
    }

    @Test
    void elTsvPorRutaMuestraComoMuchoLasDiezMayores() {
        List<StatsRepository.Conteo> rutas = new ArrayList<>();
        for (int i = 1; i <= 25; i++) {
            rutas.add(new StatsRepository.Conteo(String.valueOf(i), 100 - i));
        }
        estadisticas.resumen = new StatsRepository.Resumen(10, 0, 0, 0);
        estadisticas.nacional = 1000;
        estadisticas.rutasNacionales = rutas;
        assertEquals(StatsManager.RUTAS_EN_TSV, manager.getKPIs(sinFiltros()).tsv().byRoute().size());
    }

    // ---- ISS ----

    @Test
    void elIssUsaLosPesosConfiguradosLasPersonasYLosSiniestrosComparables() {
        estadisticas.resumen = new StatsRepository.Resumen(40, 0, 0, 0);
        estadisticas.nacional = 40;
        estadisticas.comunes = 40;
        estadisticas.lesiones = new StatsRepository.Lesiones(100, 2, 10, 50);
        // (10*2 + 5*10 + 1*50) / 40 = 3
        assertEquals(3.0, manager.getKPIs(sinFiltros()).iss().value(), 1e-9);

        config = new SystemConfig(20, 5, 1, Set.of(), Set.of());
        // (20*2 + 5*10 + 1*50) / 40 = 3,5: cambiar el peso cambia el índice
        assertEquals(3.5, manager.getKPIs(sinFiltros()).iss().value(), 1e-9);
    }

    @Test
    void elIssSinPersonasOSinSiniestrosEsSinDatos() {
        estadisticas.resumen = new StatsRepository.Resumen(40, 0, 0, 0);
        estadisticas.nacional = 40;
        estadisticas.comunes = 40;
        estadisticas.lesiones = new StatsRepository.Lesiones(0, 0, 0, 0);
        assertNull(manager.getKPIs(sinFiltros()).iss().value());
        assertTrue(manager.getKPIs(sinFiltros()).iss().scope().contains("Sin datos"));

        estadisticas.lesiones = new StatsRepository.Lesiones(10, 1, 1, 1);
        estadisticas.comunes = 0;
        assertNull(manager.getKPIs(sinFiltros()).iss().value());
    }

    @Test
    void elIssDiceQueFiltrosNoPudoAplicar() {
        estadisticas.resumen = new StatsRepository.Resumen(40, 0, 0, 0);
        estadisticas.nacional = 40;
        estadisticas.comunes = 40;
        estadisticas.lesiones = new StatsRepository.Lesiones(10, 1, 1, 1);
        FilterCriteria c = new FilterCriteria(null, null, null, null, null, null, null, null, null, null,
                Climate.LLUVIA, null, null, null, Gender.FEMENINO);

        String ambito = manager.getKPIs(c).iss().scope();

        assertTrue(ambito.contains("No aplicados al ISS: clima, género"), ambito);
    }

    // ---- TPR ----

    @Test
    void elTprSinTiemposDeRespuestaEsSinDatosYNoCero() {
        estadisticas.resumen = new StatsRepository.Resumen(500, 0, 0, 0);
        estadisticas.nacional = 500;
        var tpr = manager.getKPIs(sinFiltros()).tpr();
        assertNull(tpr.value());
        assertEquals("min", tpr.unit());
        assertTrue(tpr.scope().contains("la fuente no registra tiempos de respuesta"), tpr.scope());
    }

    @Test
    void elTprSeDivideEntreLosSiniestrosQueTienenTiempo() {
        estadisticas.resumen = new StatsRepository.Resumen(10, 4, 100, 0);
        estadisticas.nacional = 10;
        var tpr = manager.getKPIs(sinFiltros()).tpr();
        assertEquals(25.0, tpr.value(), 1e-9);
        assertTrue(tpr.scope().contains("4 siniestros con tiempo registrado (de 10)"), tpr.scope());

        estadisticas.resumen = new StatsRepository.Resumen(10, 10, 100, 0);
        assertEquals(10.0, manager.getKPIs(sinFiltros()).tpr().value(), 1e-9);
        assertEquals("Sin filtros (todos los registros válidos)", manager.getKPIs(sinFiltros()).tpr().scope());
    }

    // ---- condiciones adversas ----

    @Test
    void lasCondicionesAdversasSonElPorcentajeDelTotalYUsanLaConfiguracion() {
        estadisticas.resumen = new StatsRepository.Resumen(120, 0, 0, 30);
        estadisticas.nacional = 120;
        assertEquals(25.0, manager.getKPIs(sinFiltros()).adverseConditionsPct().value(), 1e-9);
        assertEquals(Set.of("LLUVIA"), estadisticas.climaRecibido);
        assertEquals(Set.of("RESBALADIZA"), estadisticas.calzadaRecibida);
    }

    // ---- gráficos ----

    @Test
    void elMapaDeCalorPoneCadaCeldaEnSuDiaYSuFranja() {
        estadisticas.celdas = List.of(
                new StatsRepository.Celda("LUNES", "MADRUGADA", 5),
                new StatsRepository.Celda("DOMINGO", "NOCHE", 9),
                new StatsRepository.Celda("FERIADO", "NOCHE", 99)); // un día que el enum no conoce se omite

        HeatmapData mapa = manager.getHeatmap(sinFiltros());

        assertEquals(List.of("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"), mapa.days());
        assertEquals(List.of("Madrugada", "Mañana", "Tarde", "Noche"), mapa.slots());
        assertEquals(5, mapa.z()[0][0]);
        assertEquals(9, mapa.z()[6][3]);
        int suma = 0;
        for (int[] fila : mapa.z()) {
            for (int n : fila) {
                suma += n;
            }
        }
        assertEquals(14, suma);
    }

    @Test
    void elParetoMuestraQuinceRutasYAcumulaSobreTodasLasRutas() {
        List<StatsRepository.Conteo> rutas = new ArrayList<>();
        for (int i = 1; i <= 20; i++) {
            rutas.add(new StatsRepository.Conteo(String.valueOf(i), 21 - i)); // 20, 19, ... 1 = 210 en total
        }
        estadisticas.rutasFiltradas = rutas;

        List<ParetoPoint> pareto = manager.getPareto(sinFiltros());

        assertEquals(StatsManager.RUTAS_EN_PARETO, pareto.size());
        assertEquals("1", pareto.get(0).route());
        assertEquals(20, pareto.get(0).incidents());
        assertEquals(100.0 * 20 / 210, pareto.get(0).cumulativePct(), 1e-9);
        // las 15 primeras suman 20+19+...+6 = 195 de 210: el acumulado NO llega a 100 aunque sea la última mostrada
        assertEquals(100.0 * 195 / 210, pareto.get(14).cumulativePct(), 1e-9);
    }

    @Test
    void sinRutasElParetoEstaVacio() {
        assertTrue(manager.getPareto(sinFiltros()).isEmpty());
    }

    @Test
    void laFatalidadPorVehiculoSePasaAPorcentaje() {
        victimas.perfil = new PerfilVictimas(300, 10, 5,
                List.of(new TramoEdad("0-4", 0, 4, 3, 2), new TramoEdad("75+", 75, null, 1, 0)),
                List.of(new FatalidadPorVehiculo("Motocicleta", 200, 5, 0.025)),
                List.of());

        DashboardCharts graficos = manager.getCharts(sinFiltros());

        assertEquals(List.of("0-4", "75+"), graficos.victims().ageRanges());
        assertEquals("Masculino", graficos.victims().series().get(0).gender());
        assertEquals(List.of(3L, 1L), graficos.victims().series().get(0).counts());
        assertEquals(List.of(2L, 0L), graficos.victims().series().get(1).counts());
        assertEquals("Motocicleta", graficos.fatalityByVehicle().get(0).vehicleType());
        assertEquals(200, graficos.fatalityByVehicle().get(0).total());
        assertEquals(5, graficos.fatalityByVehicle().get(0).fatalities());
        assertEquals(2.5, graficos.fatalityByVehicle().get(0).fatalityRatePct(), 1e-9);
        assertTrue(graficos.filtrosNoAplicados().isEmpty());
    }

    @Test
    void losGraficosInformanLosFiltrosQueAlgunGraficoNoPuedeAplicar() {
        victimas.perfil = new PerfilVictimas(0, 0, 0, List.of(), List.of(), List.of("clima"));
        FilterCriteria c = new FilterCriteria(null, null, null, null, null, null, null, null, null, null,
                Climate.LLUVIA, null, 18, null, Gender.FEMENINO);

        DashboardCharts graficos = manager.getCharts(c);

        // los de siniestros no tienen edad ni género; los de personas no tienen clima
        assertEquals(List.of("edad", "genero", "clima"), graficos.filtrosNoAplicados());
        assertNotNull(graficos.heatmap());
    }

    // ---- resumen público ----

    @Test
    void elResumenPublicoTomaLaProvinciaConMasSiniestros() {
        estadisticas.resumen = new StatsRepository.Resumen(200, 0, 0, 0);
        estadisticas.provincias = List.of(new StatsRepository.Conteo("SAN_JOSE", 80),
                new StatsRepository.Conteo("LIMON", 20));
        estadisticas.anios = List.of(new StatsRepository.Conteo("2020", 90), new StatsRepository.Conteo("2021", 110));

        PublicSummary resumen = manager.getPublicSummary();

        assertEquals(200, resumen.totalIncidents());
        assertEquals("San José", resumen.topProvince());
        assertEquals(40.0, resumen.tsv().value(), 1e-9);
        assertEquals("Provincia con más siniestros: San José", resumen.tsv().scope());
        assertEquals(new PublicSummary.ProvinceCount("Limón", 20), resumen.incidentsByProvince().get(1));
        assertEquals(new PublicSummary.YearCount(2021, 110), resumen.yearlyEvolution().get(1));
    }

    @Test
    void sinSiniestrosElResumenPublicoNoTieneProvinciaPrincipal() {
        PublicSummary resumen = manager.getPublicSummary();
        assertEquals(0, resumen.totalIncidents());
        assertNull(resumen.topProvince());
        assertNull(resumen.tsv().value());
    }

    // ---- ámbito y validación ----

    @Test
    void elAmbitoEnumeraLosFiltrosEnTexto() {
        assertEquals("Sin filtros (todos los registros válidos)", manager.describeScope(sinFiltros()));
        FilterCriteria c = new FilterCriteria(Province.SAN_JOSE, "Escazú", null, "27", 2023, 4, null, null, null,
                null, null, null, 18, 25, Gender.MASCULINO);
        assertEquals("Provincia: San José · Cantón: Escazú · Ruta: 27 · Año: 2023 · Mes: Abril · Edad: 18-25"
                + " · Género: Masculino", manager.describeScope(c));
        FilterCriteria soloMinima = new FilterCriteria(null, null, null, null, null, null, null, null, null, null,
                null, null, 60, null, null);
        assertEquals("Edad: desde 60", manager.describeScope(soloMinima));
    }

    @Test
    void losFiltrosInvalidosSeRechazan() {
        FilterCriteria anioRaro = new FilterCriteria(null, null, null, null, 1800, null, null, null, null, null,
                null, null, null, null, null);
        assertThrows(FiltroInvalidoException.class, () -> manager.getKPIs(anioRaro));
        assertThrows(FiltroInvalidoException.class, () -> manager.getCharts(anioRaro));
        assertThrows(FiltroInvalidoException.class, () -> manager.getHeatmap(anioRaro));
        assertThrows(FiltroInvalidoException.class, () -> manager.getPareto(anioRaro));
    }
}
