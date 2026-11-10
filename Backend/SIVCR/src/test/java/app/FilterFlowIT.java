package app;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Prueba de integración de filtros, tabla de registros, consultas guardadas e historial (Bloque B) contra
 * PostgreSQL REAL en contenedor. Carga primero la muestra sintética de COSEVI por el endpoint de ingesta
 * (3 registros VALIDO, 1 INCOMPLETO y 2 CORRUPTO) y luego consulta con los endpoints nuevos.
 *
 * Requiere Docker. Se ejecuta con "mvn verify" (Failsafe), no con "mvn test".
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FilterFlowIT {

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
    }

    // ---- utilidades ----

    private void cargarMuestra() throws Exception {
        byte[] csv = new ClassPathResource("muestras/SINTETICO-cosevi-siniestros.csv").getContentAsByteArray();
        MockMultipartHttpServletRequestBuilder peticion = multipart("/api/ingestion/upload");
        peticion.file(new MockMultipartFile("file", "siniestros.csv", "text/csv", csv));
        peticion.param("fuente", "COSEVI"); // param() devuelve el tipo padre, por eso no se encadena
        mvc.perform(peticion.with(ADMIN).with(csrf())).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions buscar(RequestPostProcessor quien, String cuerpo,
                                                                      String consulta) throws Exception {
        return mvc.perform(post("/api/records/search" + consulta)
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo).with(quien).with(csrf()));
    }

    private long contar(String sql, Object... parametros) {
        return jdbc.queryForObject(sql, Long.class, parametros);
    }

    // ---- tabla de registros y filtros (HU 6 a 10, 20) ----

    @Test
    void sinFiltrosLaTablaMuestraSoloLosRegistrosValidos() throws Exception {
        cargarMuestra();
        buscar(ANALISTA, "{}", "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[?(@.calidad != 'VALIDO')]").isEmpty());
    }

    @Test
    void sinCuerpoTambienFuncionaComoSinFiltros() throws Exception {
        cargarMuestra();
        mvc.perform(post("/api/records/search").with(ANALISTA).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3));
    }

    @Test
    void filtraPorProvinciaYCoincideConLaBaseDeDatos() throws Exception {
        cargarMuestra();
        long esperado = contar("select count(*) from sinister where calidad = 'VALIDO' and provincia = 'LIMON'");
        buscar(ANALISTA, "{\"provincia\":\"LIMON\"}", "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(esperado))
                .andExpect(jsonPath("$.items[?(@.provincia != 'LIMON')]").isEmpty());
    }

    @Test
    void filtraPorVariosCriteriosALaVez() throws Exception {
        cargarMuestra();
        long esperado = contar("select count(*) from sinister where calidad = 'VALIDO' and provincia = 'LIMON' "
                + "and anio = 2023 and mes = 4 and dia_semana = 'SABADO' and franja = 'NOCHE'");
        buscar(ANALISTA, "{\"provincia\":\"LIMON\",\"anio\":2023,\"mes\":4,\"diaSemana\":\"SABADO\","
                + "\"franja\":\"NOCHE\"}", "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(esperado));
    }

    @Test
    void paginaYOrdena() throws Exception {
        cargarMuestra();
        buscar(ANALISTA, "{}", "?page=0&size=2")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.totalPaginas").value(2))
                .andExpect(jsonPath("$.pagina").value(0));
        buscar(ANALISTA, "{}", "?page=1&size=2")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)));

        String ultimaProvincia = jdbc.queryForObject(
                "select max(provincia) from sinister where calidad = 'VALIDO'", String.class);
        buscar(ANALISTA, "{}", "?sort=provincia:desc")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].provincia").value(ultimaProvincia));
    }

    @Test
    void rechazaFiltrosYParametrosInvalidos() throws Exception {
        cargarMuestra();
        // edad y género son datos de víctimas: todavía no se combinan con siniestros
        buscar(ANALISTA, "{\"edadMin\":14,\"edadMax\":23}", "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("víctimas")));
        buscar(ANALISTA, "{\"mes\":13}", "")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("mes")));
        buscar(ANALISTA, "{}", "?sort=id;drop")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("Orden no permitido")));
        buscar(ANALISTA, "{}", "?page=-1").andExpect(status().isBadRequest());
        // valor que no existe en el enum
        buscar(ANALISTA, "{\"calzada\":\"NO_EXISTE\"}", "").andExpect(status().isBadRequest());
        assertEquals(3L, contar("select count(*) from sinister where calidad = 'VALIDO'"), "la base no se tocó");
    }

    @Test
    void soloAdminYAnalistaPuedenConsultar() throws Exception {
        cargarMuestra();
        buscar(ADMIN, "{}", "").andExpect(status().isOk());
        buscar(CONSULTOR, "{}", "").andExpect(status().isForbidden());
        mvc.perform(get("/api/queries/saved").with(CONSULTOR)).andExpect(status().isForbidden());
        mvc.perform(get("/api/queries/history").with(CONSULTOR)).andExpect(status().isForbidden());

        // sin autenticar: no hay acceso (el código exacto depende del mecanismo de seguridad vigente)
        int sinSesion = mvc.perform(post("/api/records/search").contentType(MediaType.APPLICATION_JSON)
                .content("{}").with(csrf())).andReturn().getResponse().getStatus();
        assertTrue(sinSesion == 401 || sinSesion == 403 || sinSesion == 302, "estado: " + sinSesion);
    }

    // ---- historial de consultas (HU 23) ----

    @Test
    void elHistorialRegistraLasConsultasDeCadaUsuarioSinRepetirNiGuardarVacias() throws Exception {
        cargarMuestra();
        buscar(ANALISTA, "{}", "").andExpect(status().isOk());                        // sin filtros: no se registra
        buscar(ANALISTA, "{\"provincia\":\"LIMON\"}", "").andExpect(status().isOk());  // se registra
        buscar(ANALISTA, "{\"provincia\":\"LIMON\"}", "?sort=mes").andExpect(status().isOk()); // repetida: no
        buscar(ANALISTA, "{\"provincia\":\"CARTAGO\"}", "?page=1&size=1").andExpect(status().isOk()); // página 1: no

        mvc.perform(get("/api/queries/history").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].resumen", containsString("Limon")))
                .andExpect(jsonPath("$[0].criterios.provincia").value("LIMON"));

        buscar(ANALISTA, "{\"provincia\":\"CARTAGO\"}", "").andExpect(status().isOk());
        MvcResult historial = mvc.perform(get("/api/queries/history").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].resumen", containsString("Cartago"))) // la más reciente primero
                .andReturn();

        // HU 23: re-ejecutar = pedir los criterios de una consulta del historial
        long idCartago = ((Number) JsonPath.read(historial.getResponse().getContentAsString(), "$[0].id")).longValue();
        mvc.perform(get("/api/queries/history/{id}", idCartago).with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provincia").value("CARTAGO"));

        // cada usuario ve solo lo suyo
        mvc.perform(get("/api/queries/history").with(ADMIN)).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/queries/history/{id}", idCartago).with(ADMIN)).andExpect(status().isNotFound());
    }

    // ---- consultas guardadas (HU 22) ----

    @Test
    void guardaListaYNoPermiteNombresRepetidosPorUsuario() throws Exception {
        String cuerpo = "{\"nombre\":\"Limon de noche\",\"criterios\":{\"provincia\":\"LIMON\",\"franja\":\"NOCHE\"}}";

        mvc.perform(post("/api/queries/saved").contentType(MediaType.APPLICATION_JSON).content(cuerpo)
                        .with(ANALISTA).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.nombre").value("Limon de noche"))
                .andExpect(jsonPath("$.criterios.provincia").value("LIMON"))
                .andExpect(jsonPath("$.criterios.franja").value("NOCHE"));

        // mismo nombre, mismo usuario: conflicto
        mvc.perform(post("/api/queries/saved").contentType(MediaType.APPLICATION_JSON).content(cuerpo)
                        .with(ANALISTA).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensaje", containsString("Limon de noche")));

        // nombre vacío
        mvc.perform(post("/api/queries/saved").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nombre\":\"  \",\"criterios\":{}}").with(ANALISTA).with(csrf()))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/queries/saved").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].criterios.provincia").value("LIMON"));

        // otro usuario no ve el filtro y puede usar el mismo nombre
        mvc.perform(get("/api/queries/saved").with(ADMIN)).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(post("/api/queries/saved").contentType(MediaType.APPLICATION_JSON).content(cuerpo)
                        .with(ADMIN).with(csrf()))
                .andExpect(status().isCreated());
        assertEquals(2L, contar("select count(*) from saved_filter"));
    }
}
