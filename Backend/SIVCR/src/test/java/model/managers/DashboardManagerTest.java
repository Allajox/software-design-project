package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import model.ConfigRepository;
import model.DashboardRepository;
import model.DashboardRepository.Ubicacion;
import model.StatsRepository.Celda;
import model.StatsRepository.Conteo;
import model.StatsRepository.Lesiones;
import model.StatsRepository.Resumen;
import model.SystemConfig;
import model.dto.DashboardFilters;
import model.dto.DashboardPanel;
import model.dto.DashboardPanel.ItemConteo;
import model.dto.OpcionesPanel;
import model.dto.ResumenPublico;
import org.junit.jupiter.api.Test;

/**
 * Fórmulas y armado del panel del dashboard (RF-2) con un repositorio simulado: no hay base de datos ni Spring. Lo que
 * el repositorio entrega ya viene agregado; aquí se comprueba que el manager aplique las fórmulas de la especificación
 * (TSV, ISS por personas, TPR, IC, TF_v), arme los gráficos con la forma del frontend y pida cada dato con los filtros
 * que le corresponden.
 */
class DashboardManagerTest {

    /** Repositorio simulado: devuelve lo que se le configure y anota con qué filtros ignorados le preguntaron. */
    private static class Datos implements DashboardRepository {
        long total = 0;
        long nacional = 0;
        long comunesConPersonas = 0;
        long sinRuta = 0;
        long sinSeveridad = 0;
        Resumen resumen = new Resumen(0, 0, 0, 0);
        Lesiones lesionesTodas = new Lesiones(0, 0, 0, 0);
        Lesiones lesionesComunes = new Lesiones(0, 0, 0, 0);
        List<Conteo> provincias = List.of();
        List<Conteo> severidades = List.of();
        List<Conteo> anios = List.of();
        List<Conteo> franjas = List.of();
        List<Conteo> rutas = List.of();
        List<Celda> celdas = List.of();
        List<PersonasPorVehiculo> vehiculos = List.of();
        List<PersonasPorEdadYGenero> edades = List.of();
        List<Ubicacion> ubicaciones = List.of();
        List<String> rutasNacionales = List.of();
        List<Integer> aniosConDatos = List.of();
        List<String> vehiculosRegistrados = List.of();

        final List<Set<String>> ignoradosAlContar = new ArrayList<>();
        Set<String> climaPedido;
        Set<String> calzadaPedida;
        final List<Boolean> comunesPedidas = new ArrayList<>();

        @Override public long contarSiniestros(DashboardFilters f, Set<String> ignorar) {
            ignoradosAlContar.add(ignorar);
            if (ignorar.isEmpty()) {
                return total;
            }
            if (ignorar.equals(GEOGRAFIA)) {
                return nacional;
            }
            if (ignorar.equals(NO_COMPARTIDOS_CON_PERSONAS)) {
                return comunesConPersonas;
            }
            if (ignorar.equals(Set.of(RUTA))) {
                return sinRuta;
            }
            if (ignorar.equals(Set.of(SEVERIDADES))) {
                return sinSeveridad;
            }
            throw new AssertionError("conteo con filtros ignorados inesperados: " + ignorar);
        }
        @Override public Resumen resumenSiniestros(DashboardFilters f, Set<String> clima, Set<String> calzada) {
            climaPedido = clima;
            calzadaPedida = calzada;
            return resumen;
        }
        @Override public List<Conteo> siniestrosPor(Columna columna, DashboardFilters f, Set<String> ignorar) {
            return switch (columna) {
                case PROVINCIA -> provincias;
                case SEVERIDAD -> severidades;
                case ANIO -> anios;
                case FRANJA -> franjas;
            };
        }
        @Override public List<Conteo> siniestrosPorRuta(DashboardFilters f) {
            return rutas;
        }
        @Override public List<Celda> siniestrosPorDiaYFranja(DashboardFilters f) {
            return celdas;
        }
        @Override public Lesiones personasPorLesion(DashboardFilters f, boolean soloComunes) {
            comunesPedidas.add(soloComunes);
            return soloComunes ? lesionesComunes : lesionesTodas;
        }
        @Override public List<PersonasPorVehiculo> personasPorVehiculo(DashboardFilters f) {
            return vehiculos;
        }
        @Override public List<PersonasPorEdadYGenero> personasPorEdadYGenero(DashboardFilters f) {
            return edades;
        }
        @Override public List<Ubicacion> ubicaciones() {
            return ubicaciones;
        }
        @Override public List<String> rutasNacionales() {
            return rutasNacionales;
        }
        @Override public List<Integer> anios() {
            return aniosConDatos;
        }
        @Override public List<String> vehiculos() {
            return vehiculosRegistrados;
        }
    }

    private final Datos datos = new Datos();
    private SystemConfig config = new SystemConfig(10, 5, 1, Set.of("LLUVIA"), Set.of("HUECOS"));
    private final ConfigRepository configuracion = () -> config;
    private final DashboardManager manager = new DashboardManager(datos, configuracion);
    private final DashboardFilters sinFiltros = DashboardFilters.vacio();

    // ---- KPI

    @Test
    void lasTarjetasSalenDeLasFormulasDeLaEspecificacion() {
        datos.total = 1000;
        datos.nacional = 800;
        datos.comunesConPersonas = 200;
        datos.resumen = new Resumen(100, 40, 800.0, 25);
        datos.lesionesTodas = new Lesiones(300, 4, 20, 60);   // con edad, género y vehículo
        datos.lesionesComunes = new Lesiones(500, 6, 30, 90); // solo ubicación y tiempo

        DashboardPanel.Kpis k = manager.getPanel(sinFiltros).kpis();

        assertEquals(100, k.siniestros());
        assertEquals(1000, k.totalRegistros());
        assertEquals(12.5, k.tsv(), 1e-9, "TSV = 100 / 800 x 100");
        // ISS: personas de ubicación y tiempo en el numerador, siniestros que comparten esos filtros en el denominador
        assertEquals((10 * 6 + 5 * 30 + 1 * 90) / 200.0, k.iss(), 1e-9);
        assertEquals(20.0, k.tpr(), 1e-9, "TPR = 800 min entre los 40 siniestros que traen tiempo");
        assertEquals(25.0, k.ic(), 1e-9, "IC = 25 adversos / 100");
        // tarjetas de personas: las de todos los filtros de personas, sin contar ilesos
        assertEquals(4, k.fallecidos());
        assertEquals(20, k.heridosGraves());
        assertEquals(60, k.heridosLeves());
        assertEquals(84, k.victimas());
    }

    @Test
    void elIssUsaLosPesosConfiguradosNoLaGravedadDelSiniestro() {
        datos.comunesConPersonas = 100;
        datos.lesionesComunes = new Lesiones(400, 10, 0, 0);
        assertEquals(10 * 10 / 100.0, manager.getPanel(sinFiltros).kpis().iss(), 1e-9);
        config = new SystemConfig(50, 5, 1, Set.of(), Set.of());
        assertEquals(50 * 10 / 100.0, manager.getPanel(sinFiltros).kpis().iss(), 1e-9,
            "cambiar W1 (fallecidos) cambia el ISS: el peso tiene efecto");
    }

    @Test
    void sinDatosNoHayNumerosInventados() {
        DashboardPanel.Kpis k = manager.getPanel(sinFiltros).kpis();
        assertEquals(0, k.siniestros());
        assertEquals(0, k.tsv());
        assertEquals(0, k.iss());
        assertEquals(0, k.ic());
        assertNull(k.tpr(), "COSEVI no trae tiempos de respuesta: el TPR no es 0, es null");
    }

    @Test
    void siSoloAlgunosSiniestrosTraenTiempoElPromedioEsDeLosQueLoTraen() {
        datos.resumen = new Resumen(100, 4, 100.0, 0);
        assertEquals(25.0, manager.getPanel(sinFiltros).kpis().tpr(), 1e-9);
    }

    @Test
    void laConfiguracionDeCondicionesAdversasLlegaAlRepositorio() {
        manager.getPanel(sinFiltros);
        assertEquals(Set.of("LLUVIA"), datos.climaPedido);
        assertEquals(Set.of("HUECOS"), datos.calzadaPedida);
    }

    @Test
    void cadaDatoSePideConLosFiltrosQueLeCorresponden() {
        manager.getPanel(sinFiltros);
        // personas: una vez con todos sus filtros (tarjetas) y una solo con los comunes (ISS)
        assertTrue(datos.comunesPedidas.contains(true) && datos.comunesPedidas.contains(false));
        // siniestros: sin nada (total registrado), sin geografía (TSV y provincias), los comunes con personas (ISS),
        // sin ruta (Pareto) y sin gravedad (su gráfico)
        assertTrue(datos.ignoradosAlContar.contains(Set.of()));
        assertTrue(datos.ignoradosAlContar.contains(DashboardRepository.GEOGRAFIA));
        assertTrue(datos.ignoradosAlContar.contains(DashboardRepository.NO_COMPARTIDOS_CON_PERSONAS));
        assertTrue(datos.ignoradosAlContar.contains(Set.of(DashboardRepository.RUTA)));
        assertTrue(datos.ignoradosAlContar.contains(Set.of(DashboardRepository.SEVERIDADES)));
    }

    // ---- gráficos

    @Test
    void lasProvinciasSalenSiempreLasSieteDeMayorAMenorConSuTsv() {
        datos.nacional = 200;
        datos.provincias = List.of(new Conteo("SAN_JOSE", 100), new Conteo("LIMON", 20), new Conteo("ALAJUELA", 60));
        List<ItemConteo> p = manager.getPanel(sinFiltros).porProvincia();
        assertEquals(7, p.size());
        assertEquals(List.of("San José", "Alajuela", "Limón"), p.subList(0, 3).stream().map(ItemConteo::etiqueta).toList());
        assertEquals(50.0, p.get(0).porcentaje(), 1e-9);
        assertEquals(0, p.get(6).valor(), "las que no tienen siniestros salen en cero, no desaparecen");
    }

    @Test
    void laGravedadSaleEnElOrdenDelFrontendYTraduceLasClavesDeLaBase() {
        datos.sinSeveridad = 100;
        datos.severidades = List.of(new Conteo("SOLO_HERIDOS_LEVES", 80), new Conteo("CON_MUERTOS_O_GRAVES", 20));
        List<ItemConteo> s = manager.getPanel(sinFiltros).porSeveridad();
        assertEquals(List.of("Fallecido", "Con muertos o graves", "Solo heridos leves"),
            s.stream().map(ItemConteo::etiqueta).toList());
        assertEquals(List.of(0L, 20L, 80L), s.stream().map(ItemConteo::valor).toList());
        assertEquals(80.0, s.get(2).porcentaje(), 1e-9);
    }

    @Test
    void losVehiculosSonLosOchoConMasPersonasConSuTasaDeFatalidadYLosPeatonesAparte() {
        List<DashboardRepository.PersonasPorVehiculo> grupos = new ArrayList<>();
        grupos.add(new DashboardRepository.PersonasPorVehiculo("Peatón", 100, 10));
        for (int i = 1; i <= 9; i++) {
            grupos.add(new DashboardRepository.PersonasPorVehiculo("Vehículo " + i, 10 * i, i));
        }
        datos.vehiculos = grupos;
        List<DashboardPanel.ItemVehiculo> v = manager.getPanel(sinFiltros).porVehiculo();
        assertEquals(8, v.size());
        assertEquals("Peatón", v.get(0).etiqueta());
        assertEquals(10.0, v.get(0).tasaFatalidad(), 1e-9, "TF_v = 10 fallecidos / 100 personas");
        long total = 100 + 10 * (1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9);
        assertEquals(100.0 * 100 / total, v.get(0).porcentaje(), 1e-9, "el % es sobre todas las personas, no solo las 8");
        assertEquals("Vehículo 9", v.get(1).etiqueta());
        assertTrue(v.stream().noneMatch(x -> x.etiqueta().equals("Vehículo 1")), "el de menos personas queda fuera");
    }

    @Test
    void elParetoDeRutasTomaLasOchoPrimerasYAcumulaSobreTodosLosSiniestros() {
        datos.sinRuta = 1000;
        List<Conteo> rutas = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            rutas.add(new Conteo(String.valueOf(100 - i), 100 - i * 5));
        }
        datos.rutas = rutas;
        var r = manager.getPanel(sinFiltros).rutasPrincipales();
        assertEquals(8, r.size());
        assertEquals("Ruta 100", r.get(0).etiqueta());
        assertEquals(10.0, r.get(0).porcentaje(), 1e-9);
        assertEquals((100 + 95) / 10.0, r.get(1).acumulado(), 1e-9);
        assertTrue(r.get(7).acumulado() > r.get(6).acumulado());
    }

    @Test
    void elMapaDeCalorUbicaCadaCeldaEnSuDiaYFranjaSinImportarTildesNiMayusculas() {
        datos.celdas = List.of(new Celda("LUNES", "MANANA", 7), new Celda("miércoles", "Noche", 3),
            new Celda("DOMINGO", "MADRUGADA", 11), new Celda("FERIADO", "NOCHE", 99));
        var m = manager.getPanel(sinFiltros).matrizDiaFranja();
        assertEquals(7, m.valores().size());
        assertEquals(4, m.valores().get(0).size());
        assertEquals(7, m.valores().get(0).get(1), "lunes por la mañana");
        assertEquals(3, m.valores().get(2).get(3), "miércoles por la noche");
        assertEquals(11, m.valores().get(6).get(0), "domingo de madrugada");
        assertEquals(11, m.maximo(), "un día que no existe no cuenta ni cambia el máximo");
    }

    @Test
    void elPerfilVaDeMayorAMenorEdadYSeparaPorGenero() {
        datos.edades = List.of(
            new DashboardRepository.PersonasPorEdadYGenero("18-25", "MASCULINO", 50),
            new DashboardRepository.PersonasPorEdadYGenero("18-25", "FEMENINO", 20),
            new DashboardRepository.PersonasPorEdadYGenero(">60", "femenino", 9),
            new DashboardRepository.PersonasPorEdadYGenero("5-9", "MASCULINO", 999));
        var p = manager.getPanel(sinFiltros).perfilDemografico();
        assertEquals(List.of(">60", "41-60", "26-40", "18-25"), p.edades());
        assertEquals(List.of(0L, 0L, 0L, 50L), p.masculino());
        assertEquals(List.of(9L, 0L, 0L, 20L), p.femenino());
    }

    // ---- consultor

    @Test
    void elResumenPublicoTrae5AgregadosNacionalesSinPersonas() {
        datos.total = 200;
        datos.nacional = 200;
        datos.sinSeveridad = 200;
        datos.anios = List.of(new Conteo("2024", 120), new Conteo("2025", 80));
        datos.franjas = List.of(new Conteo("MANANA", 50), new Conteo("NOCHE", 150));
        datos.provincias = List.of(new Conteo("SAN_JOSE", 100));
        datos.severidades = List.of(new Conteo("SOLO_HERIDOS_LEVES", 180), new Conteo("CON_MUERTOS_O_GRAVES", 20));
        ResumenPublico r = manager.getPublicSummary();
        assertEquals(200, r.totalSiniestros());
        assertEquals(List.of("2024", "2025"), r.porAnio().stream().map(ItemConteo::etiqueta).toList());
        assertEquals(60.0, r.porAnio().get(0).porcentaje(), 1e-9);
        assertEquals(List.of("Madrugada", "Mañana", "Tarde", "Noche"),
            r.porFranja().stream().map(ItemConteo::etiqueta).toList());
        assertEquals(75.0, r.porFranja().get(3).porcentaje(), 1e-9);
        assertEquals("San José", r.porProvincia().get(0).etiqueta());
        assertEquals(7, r.porProvincia().size());
        assertEquals(3, r.porSeveridad().size());
    }

    // ---- opciones de las listas de filtros

    @Test
    void lasOpcionesAgrupanCantonesPorProvinciaYDistritosPorCantonConLasEtiquetasDelFrontend() {
        datos.ubicaciones = List.of(
            new Ubicacion("SAN_JOSE", "Escazú", "San Rafael"),
            new Ubicacion("SAN_JOSE", "Escazú", "Escazú"),
            new Ubicacion("SAN_JOSE", "Alajuelita", "Concepción"),
            new Ubicacion("LIMON", "Pococí", "Guápiles"));
        OpcionesPanel o = manager.getOptions();
        assertEquals(List.of("San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"),
            o.provincias());
        assertEquals(List.of("Alajuelita", "Escazú"), o.cantones().get("San José"));
        assertEquals(List.of("Pococí"), o.cantones().get("Limón"));
        assertEquals(List.of("Escazú", "San Rafael"), o.distritos().get("Escazú"));
        assertEquals(List.of("Guápiles"), o.distritos().get("Pococí"));
    }

    @Test
    void todasLasProvinciasSalenAunqueNoTenganDatos() {
        OpcionesPanel o = manager.getOptions();
        assertEquals(7, o.cantones().size());
        assertTrue(o.cantones().values().stream().allMatch(List::isEmpty));
        assertTrue(o.distritos().isEmpty());
    }

    @Test
    void unaProvinciaDesconocidaNoSeMuestra() {
        datos.ubicaciones = List.of(new Ubicacion("ATLANTIDA", "Poseidón", "Centro"));
        OpcionesPanel o = manager.getOptions();
        assertTrue(o.distritos().isEmpty());
        assertFalse(o.cantones().containsKey("ATLANTIDA"));
    }

    @Test
    void losNombresSeOrdenanComoEnEspanolSinMandarLasTildesAlFinal() {
        datos.ubicaciones = List.of(
            new Ubicacion("HEREDIA", "San Rafael", "Zeta"),
            new Ubicacion("HEREDIA", "San Rafael", "Ángeles"),
            new Ubicacion("HEREDIA", "San Rafael", "Bajo"));
        assertEquals(List.of("Ángeles", "Bajo", "Zeta"), manager.getOptions().distritos().get("San Rafael"));
    }

    @Test
    void lasRutasSalenConElFormatoDelFrontendYLosVehiculosOrdenados() {
        datos.rutasNacionales = List.of("1", "2", "27", "209");
        datos.aniosConDatos = List.of(2020, 2021, 2025);
        datos.vehiculosRegistrados = List.of("Pick up", "Automóvil", "Bicicleta");
        OpcionesPanel o = manager.getOptions();
        assertEquals(List.of("Ruta 1", "Ruta 2", "Ruta 27", "Ruta 209"), o.rutas());
        assertEquals(List.of(2020, 2021, 2025), o.anios());
        assertEquals(List.of("Automóvil", "Bicicleta", "Pick up"), o.vehiculos());
    }
}
