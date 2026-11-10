package model.managers;

import static model.Claves.norm;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.UnaryOperator;
import model.Claves;
import model.ConfigRepository;
import model.DashboardRepository;
import model.DashboardRepository.Columna;
import model.DashboardRepository.PersonasPorEdadYGenero;
import model.DashboardRepository.PersonasPorVehiculo;
import model.DashboardRepository.Ubicacion;
import model.StatsRepository.Celda;
import model.StatsRepository.Conteo;
import model.StatsRepository.Lesiones;
import model.StatsRepository.Resumen;
import model.SystemConfig;
import model.dto.DashboardFilters;
import model.dto.DashboardPanel;
import model.dto.DashboardPanel.ItemConteo;
import model.dto.DashboardPanel.ItemRuta;
import model.dto.DashboardPanel.ItemVehiculo;
import model.dto.DashboardPanel.Kpis;
import model.dto.DashboardPanel.MatrizDiaFranja;
import model.dto.DashboardPanel.PerfilDemografico;
import model.dto.OpcionesPanel;
import model.dto.ResumenPublico;
import model.interfaces.IDashboardManager;

/**
 * Panel del dashboard con la forma que lee el frontend (RF-2): KPI, siniestros por provincia, personas por vehículo,
 * siniestros por gravedad, Pareto de rutas, mapa de calor día x franja y perfil por edad y género. Las consultas viven
 * en app.persistence detrás de DashboardRepository; aquí viven las fórmulas (especificación, sección 3.4) y el armado.
 * No depende de Spring ni de SQL.
 *
 * Las fórmulas son las mismas de StatsManager, así una tarjeta del panel y su KPI del SAD dan el mismo número:
 * - TSV = siniestros de la zona / siniestros del país (sin geografía) x 100;
 * - ISS = (W1 fallecidos + W2 graves + W3 leves) / siniestros, con las PERSONAS en el numerador y los siniestros en el
 *   denominador, ambos con los filtros que comparten (ubicación y tiempo). Los siniestros de COSEVI no distinguen
 *   fallecidos de graves, así que contarlos por su gravedad dejaría el peso de los fallecidos sin efecto;
 * - IC = siniestros con clima o calzada adversos / siniestros x 100 (los valores adversos salen de la configuración);
 * - TPR = promedio de los tiempos registrados; sin ningún tiempo (hoy, COSEVI) es null.
 *
 * Los filtros se reparten entre siniestros y personas como en DashboardRepository: los gráficos de siniestros no ven
 * vehículo, edad ni género; los de personas no ven ruta, franja, clima, calzada ni severidad.
 */
public class DashboardManager implements IDashboardManager {

    static final List<String> PROVINCIAS = List.of(
        "San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón");
    static final List<String> DIAS = List.of(
        "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo");
    static final List<String> FRANJAS = List.of("Madrugada", "Mañana", "Tarde", "Noche");
    /** Categorías de gravedad que muestra el frontend. La base solo guarda dos (COSEVI), el resto queda en cero. */
    static final List<String> SEVERIDADES = List.of("Fallecido", "Con muertos o graves", "Solo heridos leves");
    /** De mayor a menor edad, como pirámide. */
    static final List<String> EDADES_PIRAMIDE = List.of(">60", "41-60", "26-40", "18-25");

    static final int VEHICULOS_EN_GRAFICO = 8;
    static final int RUTAS_EN_PARETO = 8;

    private final DashboardRepository repositorio;
    private final ConfigRepository configuracion;

    public DashboardManager(DashboardRepository repositorio, ConfigRepository configuracion) {
        this.repositorio = repositorio;
        this.configuracion = configuracion;
    }

    @Override
    public DashboardPanel getPanel(DashboardFilters f) {
        return new DashboardPanel(
            kpis(f),
            provincias(f),
            vehiculos(f),
            severidades(f),
            rutas(f),
            matriz(f),
            perfil(f));
    }

    // ------------------------------------------------------------------------------------------------ opciones

    /** Orden alfabético del español: "Ángeles" va con la A, no después de la Z. */
    private static final Comparator<String> ALFABETICO = Collator.getInstance(Locale.forLanguageTag("es"))::compare;

    @Override
    public OpcionesPanel getOptions() {
        Map<String, String> provinciaDe = new HashMap<>();
        for (String provincia : PROVINCIAS) {
            provinciaDe.put(norm(provincia), provincia);
        }
        // Se parte de las siete provincias para que todas salgan aunque alguna no tenga datos todavía
        Map<String, TreeSet<String>> cantones = new LinkedHashMap<>();
        for (String provincia : PROVINCIAS) {
            cantones.put(provincia, new TreeSet<>(ALFABETICO));
        }
        Map<String, TreeSet<String>> distritos = new TreeMap<>(ALFABETICO);
        for (Ubicacion u : repositorio.ubicaciones()) {
            String provincia = provinciaDe.get(norm(u.provincia()));
            if (provincia == null) {
                continue;
            }
            cantones.get(provincia).add(u.canton());
            distritos.computeIfAbsent(u.canton(), c -> new TreeSet<>(ALFABETICO)).add(u.distrito());
        }
        List<String> vehiculos = new ArrayList<>(repositorio.vehiculos());
        vehiculos.sort(ALFABETICO);
        return new OpcionesPanel(
            PROVINCIAS,
            enListas(cantones),
            enListas(distritos),
            repositorio.rutasNacionales().stream().map(ruta -> "Ruta " + ruta).toList(),
            repositorio.anios(),
            vehiculos);
    }

    private static Map<String, List<String>> enListas(Map<String, TreeSet<String>> conjuntos) {
        Map<String, List<String>> listas = new LinkedHashMap<>();
        conjuntos.forEach((clave, valores) -> listas.put(clave, List.copyOf(valores)));
        return listas;
    }

    // ---------------------------------------------------------------------------------------------------- KPI

    private Kpis kpis(DashboardFilters f) {
        SystemConfig config = configuracion.leer();
        Resumen resumen = repositorio.resumenSiniestros(f, config.climaAdverso(), config.calzadaAdversa());
        long total = repositorio.contarSiniestros(DashboardFilters.vacio(), Set.of());
        long nacional = repositorio.contarSiniestros(f, DashboardRepository.GEOGRAFIA);

        // personas con todos los filtros de personas: las tarjetas de fallecidos, heridos graves y heridos leves
        Lesiones personas = repositorio.personasPorLesion(f, false);
        long afectadas = personas.fallecidos() + personas.graves() + personas.leves(); // sin contar ilesos

        Double tpr = resumen.conTiempoRespuesta() == 0
            ? null
            : resumen.sumaTiempoRespuesta() / resumen.conTiempoRespuesta();

        return new Kpis(resumen.total(), total, porcentaje(resumen.total(), nacional), iss(f, config), tpr, afectadas,
            personas.fallecidos(), personas.graves(), personas.leves(), porcentaje(resumen.adversos(), resumen.total()));
    }

    /** ISS (3.4.2): personas en el numerador y siniestros en el denominador, con los filtros que comparten. */
    private double iss(DashboardFilters f, SystemConfig config) {
        Lesiones lesiones = repositorio.personasPorLesion(f, true);
        long siniestros = repositorio.contarSiniestros(f, DashboardRepository.NO_COMPARTIDOS_CON_PERSONAS);
        if (lesiones.personas() == 0 || siniestros == 0) {
            return 0;
        }
        double ponderado = config.wFallecido() * lesiones.fallecidos()
            + config.wHeridoGrave() * lesiones.graves()
            + config.wHeridoLeve() * lesiones.leves();
        return ponderado / siniestros;
    }

    // ------------------------------------------------------------------------------------------------ gráficos

    /** Siniestros por provincia contra el país (sin los filtros de geografía), siempre las 7, de mayor a menor. */
    private List<ItemConteo> provincias(DashboardFilters f) {
        long base = repositorio.contarSiniestros(f, DashboardRepository.GEOGRAFIA);
        Map<String, Long> conteo = comoMapa(
            repositorio.siniestrosPor(Columna.PROVINCIA, f, DashboardRepository.GEOGRAFIA), Claves::norm);
        List<ItemConteo> lista = new ArrayList<>();
        for (String provincia : PROVINCIAS) {
            long n = conteo.getOrDefault(norm(provincia), 0L);
            lista.add(new ItemConteo(provincia, n, porcentaje(n, base)));
        }
        lista.sort(Comparator.comparingLong(ItemConteo::valor).reversed());
        return lista;
    }

    /** Siniestros por gravedad, sin el filtro de gravedad, en el orden del frontend. */
    private List<ItemConteo> severidades(DashboardFilters f) {
        Set<String> ignorar = Set.of(DashboardRepository.SEVERIDADES);
        long base = repositorio.contarSiniestros(f, ignorar);
        Map<String, Long> conteo = comoMapa(repositorio.siniestrosPor(Columna.SEVERIDAD, f, ignorar),
            Claves::severidad);
        List<ItemConteo> lista = new ArrayList<>();
        for (String severidad : SEVERIDADES) {
            long n = conteo.getOrDefault(Claves.severidad(severidad), 0L);
            lista.add(new ItemConteo(severidad, n, porcentaje(n, base)));
        }
        return lista;
    }

    /**
     * Personas por vehículo con su tasa de fatalidad (TF_v, 3.4.4), sin el filtro de vehículo: los 8 grupos con más
     * personas. Es por persona y los peatones van aparte; el archivo de personas no dice a qué siniestro pertenecen.
     */
    private List<ItemVehiculo> vehiculos(DashboardFilters f) {
        List<PersonasPorVehiculo> grupos = new ArrayList<>(repositorio.personasPorVehiculo(f));
        long total = grupos.stream().mapToLong(PersonasPorVehiculo::personas).sum();
        grupos.sort(Comparator.comparingLong(PersonasPorVehiculo::personas).reversed()
            .thenComparing(PersonasPorVehiculo::vehiculo, String.CASE_INSENSITIVE_ORDER));
        List<ItemVehiculo> lista = new ArrayList<>();
        for (PersonasPorVehiculo g : primeros(grupos, VEHICULOS_EN_GRAFICO)) {
            lista.add(new ItemVehiculo(g.vehiculo(), g.personas(), porcentaje(g.personas(), total),
                porcentaje(g.fallecidos(), g.personas())));
        }
        return lista;
    }

    /**
     * Pareto: las 8 rutas con más siniestros, sin el filtro de ruta. Los porcentajes (y el acumulado) son sobre todos
     * los siniestros del alcance, no solo los de rutas numeradas: así lo calcula el frontend.
     */
    private List<ItemRuta> rutas(DashboardFilters f) {
        long base = repositorio.contarSiniestros(f, Set.of(DashboardRepository.RUTA));
        List<ItemRuta> lista = new ArrayList<>();
        long acumulado = 0;
        for (Conteo ruta : primeros(repositorio.siniestrosPorRuta(f), RUTAS_EN_PARETO)) {
            acumulado += ruta.incidentes();
            lista.add(new ItemRuta("Ruta " + ruta.clave(), ruta.incidentes(), porcentaje(ruta.incidentes(), base),
                porcentaje(acumulado, base)));
        }
        return lista;
    }

    /** Mapa de calor día de la semana x franja horaria, con todos los filtros de siniestros. */
    private MatrizDiaFranja matriz(DashboardFilters f) {
        long[][] m = new long[DIAS.size()][FRANJAS.size()];
        for (Celda celda : repositorio.siniestrosPorDiaYFranja(f)) {
            int d = indice(DIAS, celda.dia());
            int fr = indice(FRANJAS, celda.franja());
            if (d >= 0 && fr >= 0) {
                m[d][fr] += celda.incidentes();
            }
        }
        List<List<Long>> valores = new ArrayList<>();
        long max = 0;
        for (long[] fila : m) {
            List<Long> l = new ArrayList<>();
            for (long v : fila) {
                l.add(v);
                max = Math.max(max, v);
            }
            valores.add(l);
        }
        return new MatrizDiaFranja(DIAS, FRANJAS, valores, max);
    }

    /** Personas por rango de edad y género (de mayor a menor edad, como pirámide), con los filtros de personas. */
    private PerfilDemografico perfil(DashboardFilters f) {
        long[] masculino = new long[EDADES_PIRAMIDE.size()];
        long[] femenino = new long[EDADES_PIRAMIDE.size()];
        for (PersonasPorEdadYGenero g : repositorio.personasPorEdadYGenero(f)) {
            int i = EDADES_PIRAMIDE.indexOf(g.rangoEdad());
            if (i < 0) {
                continue;
            }
            String genero = norm(g.genero());
            if (genero.equals("MASCULINO")) {
                masculino[i] += g.personas();
            } else if (genero.equals("FEMENINO")) {
                femenino[i] += g.personas();
            }
        }
        List<Long> m = new ArrayList<>();
        List<Long> fe = new ArrayList<>();
        for (int i = 0; i < masculino.length; i++) {
            m.add(masculino[i]);
            fe.add(femenino[i]);
        }
        return new PerfilDemografico(EDADES_PIRAMIDE, m, fe);
    }

    // ---------------------------------------------------------------------------------------------- consultor

    /** Solo agregados nacionales de siniestros: sin personas y sin los filtros del cliente. */
    @Override
    public ResumenPublico getPublicSummary() {
        DashboardFilters sinFiltros = DashboardFilters.vacio();
        long base = repositorio.contarSiniestros(sinFiltros, Set.of());

        List<ItemConteo> porAnio = new ArrayList<>();
        for (Conteo c : repositorio.siniestrosPor(Columna.ANIO, sinFiltros, Set.of())) {
            porAnio.add(new ItemConteo(c.clave(), c.incidentes(), porcentaje(c.incidentes(), base)));
        }
        Map<String, Long> franjas = comoMapa(repositorio.siniestrosPor(Columna.FRANJA, sinFiltros, Set.of()),
            Claves::norm);
        List<ItemConteo> porFranja = new ArrayList<>();
        for (String franja : FRANJAS) {
            long n = franjas.getOrDefault(norm(franja), 0L);
            porFranja.add(new ItemConteo(franja, n, porcentaje(n, base)));
        }
        return new ResumenPublico(base, porAnio, provincias(sinFiltros), severidades(sinFiltros), porFranja);
    }

    // ------------------------------------------------------------------------------------------------ apoyo

    /** Suma los conteos por clave normalizada (dos valores que normalizan igual cuentan juntos). */
    private static Map<String, Long> comoMapa(List<Conteo> conteos, UnaryOperator<String> clave) {
        Map<String, Long> mapa = new HashMap<>();
        for (Conteo c : conteos) {
            mapa.merge(clave.apply(c.clave()), c.incidentes(), Long::sum);
        }
        return mapa;
    }

    private static int indice(List<String> catalogo, String crudo) {
        if (crudo == null) {
            return -1;
        }
        String k = norm(crudo);
        for (int i = 0; i < catalogo.size(); i++) {
            if (norm(catalogo.get(i)).equals(k)) {
                return i;
            }
        }
        return -1;
    }

    private static double porcentaje(long parte, long total) {
        return total == 0 ? 0 : 100.0 * parte / total;
    }

    private static <T> List<T> primeros(List<T> lista, int cantidad) {
        return lista.size() <= cantidad ? lista : lista.subList(0, cantidad);
    }
}
