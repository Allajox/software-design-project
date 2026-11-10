package app;

import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Prueba de integración del dashboard (KPI, gráficos, resumen público), del orden multinivel de la tabla y de la
 * exportación CSV/Excel/PDF contra PostgreSQL REAL en contenedor. Carga las muestras sintéticas de COSEVI (siniestros y
 * personas) por el endpoint de ingesta y consulta con los endpoints nuevos.
 *
 * Con las muestras: 3 siniestros VALIDO (San José 2024 buen tiempo; Limón 2023 lluvia y calzada resbaladiza, único
 * adverso; Alajuela 2022 sin clima ni calzada, ruta "Cantonal") y 3 personas VALIDO (una herida leve en San José,
 * una peatona herida grave en Limón, un ileso en Alajuela). Con los pesos por omisión 10/5/1 el ISS sin filtros es
 * (5 + 1) / 3 = 2.
 *
 * Requiere Docker. Se ejecuta con "mvn verify" (Failsafe), no con "mvn test".
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class DashboardFlowIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final RequestPostProcessor ADMIN = user("admin@sivcr.go.cr").roles("ADMIN");
    private static final RequestPostProcessor ANALISTA = user("analista@sivcr.go.cr").roles("ANALISTA");
    private static final RequestPostProcessor CONSULTOR = user("consultor@sivcr.go.cr").roles("CONSULTOR");

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void partirDeCero() {
        String insertar = "INSERT INTO app_user (id, name, email, password_hash, rol) VALUES (?, ?, ?, '{noop}x', ?) "
                + "ON CONFLICT DO NOTHING";
        jdbc.update(insertar, 1L, "Ana Administradora", "admin@sivcr.go.cr", "ADMIN");
        jdbc.update(insertar, 2L, "Luis Analista", "analista@sivcr.go.cr", "ANALISTA");
        jdbc.update(insertar, 3L, "Carla Consultora", "consultor@sivcr.go.cr", "CONSULTOR");
        jdbc.update("DELETE FROM query_history");
        jdbc.update("DELETE FROM saved_filter");
        jdbc.update("DELETE FROM victim");
        jdbc.update("DELETE FROM sinister");
        jdbc.update("DELETE FROM quality_report");
        jdbc.update("DELETE FROM ingestion_log");
        // los valores iniciales de la migración V2; algunas pruebas cambian la configuración global
        jdbc.update("UPDATE system_config SET w_fallecido = 10, w_herido_grave = 5, w_herido_leve = 1, "
                + "clima_adverso = ARRAY['LLUVIA', 'NEBLINA', 'LLUVIA_CON_NEBLINA'], "
                + "calzada_adversa = ARRAY['RESBALADIZA', 'HUECOS', 'HUNDIMIENTOS'], actualizado_por = NULL");
    }

    // ---- utilidades ----

    private void cargar(String muestra, String nombre) throws Exception {
        byte[] csv = new ClassPathResource("muestras/" + muestra).getContentAsByteArray();
        MockMultipartHttpServletRequestBuilder peticion = multipart("/api/ingestion/upload");
        peticion.file(new MockMultipartFile("file", nombre, "text/csv", csv));
        peticion.param("fuente", "COSEVI"); // param() devuelve el tipo padre, por eso no se encadena
        mvc.perform(peticion.with(ADMIN).with(csrf())).andExpect(status().isOk());
    }

    private void cargarSiniestrosYPersonas() throws Exception {
        cargar("SINTETICO-cosevi-siniestros.csv", "siniestros.csv");
        cargar("SINTETICO-cosevi-personas.csv", "personas.csv");
    }

    private ResultActions kpis(RequestPostProcessor quien, String cuerpo) throws Exception {
        return mvc.perform(post("/api/dashboard/kpis")
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo).with(quien).with(csrf()));
    }

    private ResultActions graficos(RequestPostProcessor quien, String cuerpo) throws Exception {
        return mvc.perform(post("/api/dashboard/charts")
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo).with(quien).with(csrf()));
    }

    private ResultActions cambiarConfiguracion(RequestPostProcessor quien, String cuerpo) throws Exception {
        return mvc.perform(put("/api/config")
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo).with(quien).with(csrf()));
    }

    private ResultActions exportar(RequestPostProcessor quien, String cuerpo, String formato) throws Exception {
        return mvc.perform(post("/api/records/export?format=" + formato)
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo).with(quien).with(csrf()));
    }

    // ---- KPI (HU 11 a 14) ----

    @Test
    void losKpiSinFiltrosCoincidenConLaMuestra() throws Exception {
        cargarSiniestrosYPersonas();
        kpis(ANALISTA, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRecords").value(3))
                .andExpect(jsonPath("$.tsv.nationalTotal").value(3))
                .andExpect(jsonPath("$.tsv.global.value", closeTo(100.0, 1e-9)))
                .andExpect(jsonPath("$.tsv.global.unit").value("%"))
                .andExpect(jsonPath("$.tsv.byProvince", hasSize(3)))
                .andExpect(jsonPath("$.tsv.byProvince[0].percentOfNational", closeTo(100.0 / 3, 1e-6)))
                // "Cantonal" no es una ruta: solo cuentan la 27 y la 32
                .andExpect(jsonPath("$.tsv.byRoute", hasSize(2)))
                .andExpect(jsonPath("$.tsv.byRoute[0].zone").value("27"))
                .andExpect(jsonPath("$.tsv.byRoute[1].zone").value("32"))
                .andExpect(jsonPath("$.iss.value", closeTo(2.0, 1e-9)))
                .andExpect(jsonPath("$.iss.unit").value("índice"))
                .andExpect(jsonPath("$.adverseConditionsPct.value", closeTo(100.0 / 3, 1e-6)))
                // la muestra no trae tiempos de respuesta: sin datos, no cero
                .andExpect(jsonPath("$.tpr.value").value(nullValue()))
                .andExpect(jsonPath("$.tpr.scope", containsString("Sin datos")));
    }

    @Test
    void losKpiRespetanLosFiltrosYDescribenElAmbito() throws Exception {
        cargarSiniestrosYPersonas();
        kpis(ANALISTA, "{\"provincia\":\"LIMON\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRecords").value(1))
                .andExpect(jsonPath("$.tsv.nationalTotal").value(3))   // el total nacional no se filtra por provincia
                .andExpect(jsonPath("$.tsv.global.value", closeTo(100.0 / 3, 1e-6)))
                .andExpect(jsonPath("$.tsv.global.scope", containsString("Limón")))
                .andExpect(jsonPath("$.iss.value", closeTo(5.0, 1e-9)))  // una persona con herida grave entre un siniestro
                .andExpect(jsonPath("$.adverseConditionsPct.value", closeTo(100.0, 1e-9)));
    }

    @Test
    void elIssAvisaQueFiltrosNoAplica() throws Exception {
        cargarSiniestrosYPersonas();
        // el clima solo existe en siniestros: el ISS (que usa personas) no lo puede aplicar y lo dice
        kpis(ANALISTA, "{\"clima\":\"LLUVIA\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRecords").value(1))
                .andExpect(jsonPath("$.iss.scope", containsString("No aplicados al ISS")))
                .andExpect(jsonPath("$.iss.scope", containsString("clima")));
    }

    @Test
    void sinDatosLosKpiNoInventanValores() throws Exception {
        kpis(ANALISTA, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRecords").value(0))
                .andExpect(jsonPath("$.tsv.global.value").value(nullValue()))
                .andExpect(jsonPath("$.iss.value").value(nullValue()))
                .andExpect(jsonPath("$.adverseConditionsPct.value").value(nullValue()));
    }

    @Test
    void losKpiNoCuentanLosSiniestrosQueVienenDeOtraFuente() throws Exception {
        cargarSiniestrosYPersonas();
        // INEC guarda sus fallecidos como siniestros; esos mismos hechos ya los reporta COSEVI y no deben sumarse
        long carga = jdbc.queryForObject("INSERT INTO ingestion_log (fuente, nombre_archivo, resultado, usuario_id, perfil) "
                + "VALUES ('INEC', 'inec.csv', 'EXITOSA', 1, 'inec-defunciones') RETURNING id", Long.class);
        jdbc.update("INSERT INTO sinister (id, ingestion_log_id, calidad, provincia, anio, mes, severidad, ruta) "
                + "VALUES (nextval('sinister_seq'), ?, 'VALIDO', 'SAN_JOSE', 2023, 5, 'FALLECIDO', '1')", carga);
        kpis(ANALISTA, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRecords").value(3));
        mvc.perform(get("/api/dashboard/public-summary").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIncidents").value(3));
    }

    // ---- gráficos (HU 15 a 18) ----

    @Test
    void losGraficosTraenMapaDeCalorParetoVictimasYFatalidad() throws Exception {
        cargarSiniestrosYPersonas();
        graficos(ANALISTA, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap.days", hasSize(7)))
                .andExpect(jsonPath("$.heatmap.slots", hasSize(4)))
                .andExpect(jsonPath("$.heatmap.z[0][1]").value(1))   // lunes por la mañana (San José)
                .andExpect(jsonPath("$.heatmap.z[2][2]").value(1))   // miércoles por la tarde (Alajuela)
                .andExpect(jsonPath("$.heatmap.z[5][3]").value(1))   // sábado por la noche (Limón)
                .andExpect(jsonPath("$.pareto", hasSize(2)))
                .andExpect(jsonPath("$.pareto[0].cumulativePct", closeTo(50.0, 1e-9)))
                .andExpect(jsonPath("$.pareto[1].cumulativePct", closeTo(100.0, 1e-9)))
                .andExpect(jsonPath("$.victims.ageRanges", hasSize(16)))
                .andExpect(jsonPath("$.victims.series", hasSize(2)))
                .andExpect(jsonPath("$.fatalityByVehicle[*].vehicleType", hasItem("Peatón")))
                .andExpect(jsonPath("$.filtrosNoAplicados", hasSize(0)));
    }

    @Test
    void edadYGeneroSeAplicanALasVictimasYSeAvisaQueAlRestoNo() throws Exception {
        cargarSiniestrosYPersonas();
        graficos(ANALISTA, "{\"genero\":\"FEMENINO\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.filtrosNoAplicados", hasItem("genero")))
                .andExpect(jsonPath("$.heatmap.z[0][1]").value(1));   // el mapa de calor sigue completo
    }

    // ---- configuración global: pesos del ISS y condiciones adversas (HU 30) ----

    @Test
    void verLaConfiguracionEsDeAdminYAnalistaPeroCambiarlaSoloDelAdmin() throws Exception {
        mvc.perform(get("/api/config").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.wFallecido").value(10.0))
                .andExpect(jsonPath("$.wHeridoGrave").value(5.0))
                .andExpect(jsonPath("$.wHeridoLeve").value(1.0))
                .andExpect(jsonPath("$.climaAdverso", hasSize(3)))
                .andExpect(jsonPath("$.calzadaAdversa", hasItem("HUECOS")));
        mvc.perform(get("/api/config").with(CONSULTOR)).andExpect(status().isForbidden());

        String cuerpo = "{\"wFallecido\":50,\"wHeridoGrave\":10,\"wHeridoLeve\":1,"
                + "\"climaAdverso\":[\"LLUVIA\"],\"calzadaAdversa\":[]}";
        cambiarConfiguracion(ANALISTA, cuerpo).andExpect(status().isForbidden());
        cambiarConfiguracion(CONSULTOR, cuerpo).andExpect(status().isForbidden());
        assertEquals(10.0, jdbc.queryForObject("select w_fallecido from system_config", Double.class),
                "un rol sin permiso no cambia nada");

        cambiarConfiguracion(ADMIN, cuerpo)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.wFallecido").value(50.0))
                .andExpect(jsonPath("$.climaAdverso", hasSize(1)))
                .andExpect(jsonPath("$.calzadaAdversa", hasSize(0)));
        mvc.perform(get("/api/config").with(ANALISTA))
                .andExpect(jsonPath("$.wFallecido").value(50.0));
    }

    @Test
    void cambiarLosPesosCambiaElIssYLosAdversosCambianElIcYQuedaQuienLoHizo() throws Exception {
        cargarSiniestrosYPersonas();
        // la muestra tiene un herido grave y uno leve entre 3 siniestros: ISS = (20 + 2) / 3
        cambiarConfiguracion(ADMIN, "{\"wFallecido\":100,\"wHeridoGrave\":20,\"wHeridoLeve\":2,"
                + "\"climaAdverso\":[],\"calzadaAdversa\":[]}").andExpect(status().isOk());
        kpis(ANALISTA, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.iss.value", closeTo(22.0 / 3, 1e-9)))
                .andExpect(jsonPath("$.adverseConditionsPct.value", closeTo(0.0, 1e-9)));
        assertEquals(1L, jdbc.queryForObject("select actualizado_por from system_config", Long.class),
                "queda registrado quién cambió la configuración");
    }

    @Test
    void rechazaConfiguracionesInvalidasSinGuardarNada() throws Exception {
        cambiarConfiguracion(ADMIN, "{\"wFallecido\":-1,\"wHeridoGrave\":5,\"wHeridoLeve\":1,"
                + "\"climaAdverso\":[],\"calzadaAdversa\":[]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("negativo")));
        cambiarConfiguracion(ADMIN, "{\"wFallecido\":10,\"wHeridoGrave\":5,\"wHeridoLeve\":1,"
                + "\"climaAdverso\":[\"GRANIZO\"],\"calzadaAdversa\":[]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("GRANIZO")));
        // faltan las listas: no se asume "vacío", para no borrar los adversos por un olvido
        cambiarConfiguracion(ADMIN, "{\"wFallecido\":10,\"wHeridoGrave\":5,\"wHeridoLeve\":1}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("climaAdverso")));
        cambiarConfiguracion(ADMIN, "{\"wFallecido\":0,\"wHeridoGrave\":0,\"wHeridoLeve\":0,"
                + "\"climaAdverso\":[],\"calzadaAdversa\":[]}")
                .andExpect(status().isBadRequest());
        assertEquals(10.0, jdbc.queryForObject("select w_fallecido from system_config", Double.class));
        assertEquals(3, jdbc.queryForObject("select cardinality(clima_adverso) from system_config", Integer.class));
    }

    // ---- resumen público (HU 19) ----

    @Test
    void elConsultorSoloVeElResumenPublico() throws Exception {
        cargarSiniestrosYPersonas();
        mvc.perform(get("/api/dashboard/public-summary").with(CONSULTOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIncidents").value(3))
                .andExpect(jsonPath("$.incidentsByProvince", hasSize(3)))
                .andExpect(jsonPath("$.yearlyEvolution", hasSize(3)));
        kpis(CONSULTOR, "{}").andExpect(status().isForbidden());
        graficos(CONSULTOR, "{}").andExpect(status().isForbidden());
    }

    @Test
    void sinSesionNoHayAccesoAlDashboard() throws Exception {
        int estado = mvc.perform(get("/api/dashboard/public-summary")).andReturn().getResponse().getStatus();
        assertTrue(estado == 401 || estado == 403 || estado == 302, "estado: " + estado);
    }

    @Test
    void rechazaFiltrosInvalidos() throws Exception {
        cargarSiniestrosYPersonas();
        kpis(ANALISTA, "{\"mes\":13}").andExpect(status().isBadRequest());
        graficos(ANALISTA, "{\"anio\":1800}").andExpect(status().isBadRequest());
    }

    // ---- orden multinivel (HU 20) ----

    @Test
    void ordenaPorVariosCamposALaVez() throws Exception {
        cargarSiniestrosYPersonas();
        mvc.perform(post("/api/records/search?sort=anio:desc,mes")
                        .contentType(MediaType.APPLICATION_JSON).content("{}").with(ANALISTA).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].anio").value(2024))
                .andExpect(jsonPath("$.items[1].anio").value(2023))
                .andExpect(jsonPath("$.items[2].anio").value(2022));
        mvc.perform(post("/api/records/search?sort=anio,mes:desc")
                        .contentType(MediaType.APPLICATION_JSON).content("{}").with(ANALISTA).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].anio").value(2022));
    }

    @Test
    void rechazaOrdenesInvalidos() throws Exception {
        cargarSiniestrosYPersonas();
        for (String orden : new String[] {"anio,anio:desc", "anio,mes,provincia,canton,ruta", "anio;drop", "anio,,mes"}) {
            mvc.perform(post("/api/records/search").param("sort", orden)
                            .contentType(MediaType.APPLICATION_JSON).content("{}").with(ANALISTA).with(csrf()))
                    .andExpect(status().isBadRequest());
        }
    }

    // ---- exportación (HU 21) ----

    @Test
    void exportaCsvConLosMismosFiltrosQueLaTabla() throws Exception {
        cargarSiniestrosYPersonas();
        MvcResult resultado = exportar(ANALISTA, "{\"provincia\":\"LIMON\"}", "CSV")
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", containsString("text/csv")))
                .andExpect(header().string("Content-Disposition", containsString("attachment; filename=\"siniestros-")))
                .andReturn();
        byte[] bytes = resultado.getResponse().getContentAsByteArray();
        assertArrayEquals(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF},
                new byte[] {bytes[0], bytes[1], bytes[2]}, "el CSV debe empezar con BOM para que Excel lea las tildes");
        String texto = new String(bytes, StandardCharsets.UTF_8);
        String[] lineas = texto.split("\r\n");
        assertEquals(2, lineas.length, "encabezado + el único siniestro de Limón");
        assertTrue(lineas[0].contains("Provincia"));
        assertTrue(lineas[1].contains("Limón"), lineas[1]);

        // sin filtros: los tres válidos; los incompletos y corruptos nunca salen
        String todos = new String(exportar(ANALISTA, "{}", "CSV").andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertEquals(4, todos.split("\r\n").length);
    }

    @Test
    void exportaPdfValido() throws Exception {
        cargarSiniestrosYPersonas();
        MvcResult resultado = exportar(ANALISTA, "{}", "PDF")
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", containsString("application/pdf")))
                .andExpect(header().string("Content-Disposition", containsString(".pdf\"")))
                .andReturn();
        String inicio = new String(resultado.getResponse().getContentAsByteArray(), 0, 8, StandardCharsets.ISO_8859_1);
        assertTrue(inicio.startsWith("%PDF-"), inicio);
    }

    @Test
    void exportaExcelValido() throws Exception {
        cargarSiniestrosYPersonas();
        MvcResult resultado = exportar(ADMIN, "{}", "EXCEL")
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString(".xlsx\"")))
                .andReturn();
        byte[] bytes = resultado.getResponse().getContentAsByteArray();
        assertEquals((byte) 'P', bytes[0], "un .xlsx es un zip: empieza con PK");
        assertEquals((byte) 'K', bytes[1]);
        // también acepta el alias xlsx
        exportar(ADMIN, "{}", "xlsx").andExpect(status().isOk());
    }

    @Test
    void laExportacionValidaFormatoPermisosYFiltros() throws Exception {
        cargarSiniestrosYPersonas();
        exportar(ANALISTA, "{}", "DOCX").andExpect(status().isBadRequest());
        exportar(CONSULTOR, "{}", "CSV").andExpect(status().isForbidden());
        // edad y género son datos de personas: no se combinan con siniestros ni al exportar
        exportar(ANALISTA, "{\"edadMin\":20}", "CSV").andExpect(status().isBadRequest());
    }

    // ---- panel del dashboard con la forma del frontend: GET /api/dashboard, /export y /api/public/summary ----

    private ResultActions panel(RequestPostProcessor quien, String parametros) throws Exception {
        return mvc.perform(get("/api/dashboard" + parametros).with(quien));
    }

    @Test
    void elPanelTraeLosKpiYLosGraficosConLaFormaQueLeeElFrontend() throws Exception {
        cargarSiniestrosYPersonas();
        panel(ANALISTA, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kpis.siniestros").value(3))
                .andExpect(jsonPath("$.kpis.totalRegistros").value(3))
                .andExpect(jsonPath("$.kpis.tsv", closeTo(100.0, 1e-9)))
                .andExpect(jsonPath("$.kpis.iss", closeTo(2.0, 1e-9)))          // el mismo ISS que POST /kpis
                .andExpect(jsonPath("$.kpis.tpr").value(nullValue()))           // sin tiempos de respuesta: null, no 0
                .andExpect(jsonPath("$.kpis.ic", closeTo(100.0 / 3, 1e-6)))
                .andExpect(jsonPath("$.kpis.victimas").value(2))                // herida grave + herida leve; el ileso no
                .andExpect(jsonPath("$.kpis.fallecidos").value(0))
                .andExpect(jsonPath("$.kpis.heridosGraves").value(1))
                .andExpect(jsonPath("$.kpis.heridosLeves").value(1))
                .andExpect(jsonPath("$.porProvincia", hasSize(7)))              // siempre las 7, también las de cero
                .andExpect(jsonPath("$.porSeveridad", hasSize(3)))
                .andExpect(jsonPath("$.porVehiculo[*].etiqueta", hasItem("Peatón")))
                .andExpect(jsonPath("$.rutasPrincipales", hasSize(2)))          // "Cantonal" no es una ruta
                .andExpect(jsonPath("$.rutasPrincipales[0].etiqueta").value("Ruta 27"))
                .andExpect(jsonPath("$.rutasPrincipales[1].acumulado", closeTo(200.0 / 3, 1e-6)))
                .andExpect(jsonPath("$.matrizDiaFranja.dias", hasSize(7)))
                .andExpect(jsonPath("$.matrizDiaFranja.valores[0][1]").value(1)) // lunes por la mañana (San José)
                .andExpect(jsonPath("$.matrizDiaFranja.valores[2][2]").value(1)) // miércoles por la tarde (Alajuela)
                .andExpect(jsonPath("$.matrizDiaFranja.valores[5][3]").value(1)) // sábado por la noche (Limón)
                .andExpect(jsonPath("$.matrizDiaFranja.maximo").value(1))
                .andExpect(jsonPath("$.perfilDemografico.edades", hasSize(4)));
        // los mismos datos por el endpoint del SAD dan el mismo número
        kpis(ANALISTA, "{}").andExpect(jsonPath("$.iss.value", closeTo(2.0, 1e-9)));
    }

    @Test
    void elPanelAceptaEtiquetasDelFrontendYVariosValoresPorFiltro() throws Exception {
        cargarSiniestrosYPersonas();
        panel(ANALISTA, "?provincia=Limón")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kpis.siniestros").value(1))
                .andExpect(jsonPath("$.kpis.tsv", closeTo(100.0 / 3, 1e-6)))    // contra el país, que no se filtra por provincia
                .andExpect(jsonPath("$.kpis.iss", closeTo(5.0, 1e-9)));
        panel(ANALISTA, "?anios=2023&anios=2024")
                .andExpect(jsonPath("$.kpis.siniestros").value(2));
        panel(ANALISTA, "?dias=Lunes&dias=Sábado&franjas=Noche")
                .andExpect(jsonPath("$.kpis.siniestros").value(1));
        panel(ANALISTA, "?ruta=Ruta 27")
                .andExpect(jsonPath("$.kpis.siniestros").value(1));
    }

    @Test
    void elPanelNoCuentaLosSiniestrosQueVienenDeOtraFuente() throws Exception {
        cargarSiniestrosYPersonas();
        long carga = jdbc.queryForObject("INSERT INTO ingestion_log (fuente, nombre_archivo, resultado, usuario_id, perfil) "
                + "VALUES ('INEC', 'inec.csv', 'EXITOSA', 1, 'inec-defunciones') RETURNING id", Long.class);
        jdbc.update("INSERT INTO sinister (id, ingestion_log_id, calidad, provincia, anio, mes, severidad, ruta) "
                + "VALUES (nextval('sinister_seq'), ?, 'VALIDO', 'SAN_JOSE', 2023, 5, 'FALLECIDO', '1')", carga);
        panel(ANALISTA, "")
                .andExpect(jsonPath("$.kpis.siniestros").value(3))
                .andExpect(jsonPath("$.kpis.totalRegistros").value(3));
        mvc.perform(get("/api/public/summary").with(ANALISTA))
                .andExpect(jsonPath("$.totalSiniestros").value(3));
    }

    @Test
    void elPanelYSuReporteSoloLosVenAdminYAnalista() throws Exception {
        cargarSiniestrosYPersonas();
        panel(ADMIN, "").andExpect(status().isOk());
        panel(CONSULTOR, "").andExpect(status().isForbidden());      // trae personas: no es del consultor
        mvc.perform(get("/api/dashboard")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/dashboard/export?format=CSV").with(CONSULTOR)).andExpect(status().isForbidden());
    }

    @Test
    void elReporteDelDashboardSeDescargaEnCsvExcelYPdf() throws Exception {
        cargarSiniestrosYPersonas();
        MvcResult csv = mvc.perform(get("/api/dashboard/export?format=CSV&provincia=Limón").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", containsString("text/csv")))
                .andExpect(header().string("Content-Disposition", containsString(".csv\"")))
                .andReturn();
        String texto = csv.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(texto.startsWith("\uFEFF"), "con BOM para que Excel abra bien los acentos");
        assertTrue(texto.contains("Filtros aplicados") && texto.contains("Limón"), texto);
        assertTrue(texto.contains("Indicadores clave") && texto.contains("Sin datos"), texto);

        MvcResult excel = mvc.perform(get("/api/dashboard/export?formato=xlsx").with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString(".xlsx\"")))
                .andReturn();
        byte[] zip = excel.getResponse().getContentAsByteArray();
        assertEquals((byte) 'P', zip[0], "un .xlsx es un zip: empieza con PK");
        assertEquals((byte) 'K', zip[1]);

        MvcResult pdf = mvc.perform(get("/api/dashboard/export?format=PDF").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", containsString("application/pdf")))
                .andReturn();
        assertTrue(new String(pdf.getResponse().getContentAsByteArray(), 0, 5, StandardCharsets.ISO_8859_1)
                .startsWith("%PDF-"));

        mvc.perform(get("/api/dashboard/export?format=DOCX").with(ANALISTA)).andExpect(status().isBadRequest());
    }

    @Test
    void lasOpcionesDelPanelSalenDeLosDatosCargados() throws Exception {
        cargarSiniestrosYPersonas();
        mvc.perform(get("/api/dashboard/opciones").with(ANALISTA))
                .andExpect(status().isOk())
                // las 7 provincias siempre están, haya o no datos
                .andExpect(jsonPath("$.provincias", hasSize(7)))
                .andExpect(jsonPath("$.provincias", hasItem("San José")))
                .andExpect(jsonPath("$.provincias", hasItem("Limón")))
                // cantones y distritos son solo los que tienen siniestros, agrupados por su provincia y su cantón
                .andExpect(jsonPath("$.cantones['San José']", contains("Escazú")))
                .andExpect(jsonPath("$.cantones['Limón']", contains("Pococí")))
                .andExpect(jsonPath("$.distritos['Escazú']", contains("San Rafael")))
                .andExpect(jsonPath("$.distritos['Pococí']", contains("Guápiles")))
                // "Cantonal" no es una ruta: solo la 27 y la 32
                .andExpect(jsonPath("$.rutas", contains("Ruta 27", "Ruta 32")))
                .andExpect(jsonPath("$.anios", contains(2022, 2023, 2024)))
                // los vehículos salen de las personas; «No aplica» (la peatona) no es un vehículo
                .andExpect(jsonPath("$.vehiculos", contains("Automóvil", "Motocicleta")));
    }

    @Test
    void sinDatosLasOpcionesTraenSoloLasProvincias() throws Exception {
        mvc.perform(get("/api/dashboard/opciones").with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provincias", hasSize(7)))
                .andExpect(jsonPath("$.rutas", hasSize(0)))
                .andExpect(jsonPath("$.anios", hasSize(0)))
                .andExpect(jsonPath("$.vehiculos", hasSize(0)));
    }

    @Test
    void lasOpcionesDelPanelSonParaQuienAnalizaYConSesion() throws Exception {
        mvc.perform(get("/api/dashboard/opciones").with(CONSULTOR)).andExpect(status().isForbidden());
        mvc.perform(get("/api/dashboard/opciones")).andExpect(status().isUnauthorized());
    }

    @Test
    void elResumenPublicoSeAbreSinSesionYSoloTraeAgregados() throws Exception {
        cargarSiniestrosYPersonas();
        mvc.perform(get("/api/public/summary").with(CONSULTOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSiniestros").value(3))
                .andExpect(jsonPath("$.porAnio", hasSize(3)))
                .andExpect(jsonPath("$.porProvincia", hasSize(7)))
                .andExpect(jsonPath("$.porSeveridad", hasSize(3)))
                .andExpect(jsonPath("$.porFranja", hasSize(4)))
                .andExpect(jsonPath("$.kpis").doesNotExist())            // sin tarjetas ni datos de personas
                .andExpect(jsonPath("$.perfilDemografico").doesNotExist());
        mvc.perform(get("/api/public/summary").with(ANALISTA)).andExpect(status().isOk());
    }

    @Test
    void elResumenPublicoNoRequiereSesionPeroElRestoDelPanelSi() throws Exception {
        cargarSiniestrosYPersonas();
        mvc.perform(get("/api/public/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSiniestros").value(3))
                .andExpect(jsonPath("$.kpis").doesNotExist())
                .andExpect(jsonPath("$.perfilDemografico").doesNotExist());
        mvc.perform(get("/api/dashboard/opciones")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/dashboard/public-summary")).andExpect(status().isUnauthorized());
    }
}
