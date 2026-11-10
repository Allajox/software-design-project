package app;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Prueba de integración del perfil de víctimas contra PostgreSQL REAL en contenedor. Carga la muestra sintética de
 * personas de COSEVI por el endpoint de ingesta (3 personas VALIDO, 1 INCOMPLETO; la fila con edad 250 es CORRUPTA y
 * no se guarda) y consulta /api/victims/profile.
 *
 * Requiere Docker. Se ejecuta con "mvn verify" (Failsafe), no con "mvn test".
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class VictimsFlowIT {

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

    private void cargarPersonas() throws Exception {
        byte[] csv = new ClassPathResource("muestras/SINTETICO-cosevi-personas.csv").getContentAsByteArray();
        MockMultipartHttpServletRequestBuilder peticion = multipart("/api/ingestion/upload");
        peticion.file(new MockMultipartFile("file", "personas.csv", "text/csv", csv));
        peticion.param("fuente", "COSEVI");
        mvc.perform(peticion.with(ADMIN).with(csrf())).andExpect(status().isOk());
    }

    private ResultActions perfil(RequestPostProcessor quien, String cuerpo) throws Exception {
        return mvc.perform(post("/api/victims/profile")
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo).with(quien).with(csrf()));
    }

    @Test
    void sinFiltrosCuentaSoloLasPersonasValidasYAgrupaPorTramoYVehiculo() throws Exception {
        cargarPersonas();
        perfil(ANALISTA, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.sinEdad").value(1))   // el conductor de moto trae edad "Desconocida"
                .andExpect(jsonPath("$.sinGenero").value(0))
                .andExpect(jsonPath("$.porEdadYGenero", hasSize(16)))
                .andExpect(jsonPath("$.porEdadYGenero[8].rango").value("40-44"))
                .andExpect(jsonPath("$.porEdadYGenero[8].masculino").value(1))
                .andExpect(jsonPath("$.porEdadYGenero[13].rango").value("65-69"))
                .andExpect(jsonPath("$.porEdadYGenero[13].femenino").value(1))
                .andExpect(jsonPath("$.fatalidadPorVehiculo", hasSize(3)))
                .andExpect(jsonPath("$.fatalidadPorVehiculo[*].vehiculo", hasItem("Peatón")))
                .andExpect(jsonPath("$.fatalidadPorVehiculo[*].vehiculo", not(hasItem("No aplica"))))
                .andExpect(jsonPath("$.filtrosNoAplicados", hasSize(0)));
    }

    @Test
    void filtraPorEdadYGeneroQueSoloExistenEnPersonas() throws Exception {
        cargarPersonas();
        perfil(ANALISTA, "{\"genero\":\"FEMENINO\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.fatalidadPorVehiculo[0].vehiculo").value("Peatón"));
        perfil(ANALISTA, "{\"edadMin\":60}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1));
        perfil(ANALISTA, "{\"edadMin\":30,\"edadMax\":45,\"provincia\":\"ALAJUELA\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void ignoraLosFiltrosDeSiniestrosEInformaCuales() throws Exception {
        cargarPersonas();
        perfil(ANALISTA, "{\"ruta\":\"27\",\"clima\":\"LLUVIA\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.filtrosNoAplicados[0]").value("ruta"))
                .andExpect(jsonPath("$.filtrosNoAplicados[1]").value("clima"));
    }

    @Test
    void rechazaFiltrosInvalidosYSoloAdminYAnalistaPuedenConsultar() throws Exception {
        cargarPersonas();
        perfil(ANALISTA, "{\"edadMin\":50,\"edadMax\":20}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("edad")));
        perfil(ANALISTA, "{\"mes\":13}").andExpect(status().isBadRequest());
        perfil(ADMIN, "{}").andExpect(status().isOk());
        perfil(CONSULTOR, "{}").andExpect(status().isForbidden());
    }

    @Test
    void laConsultaConFiltrosQuedaEnElHistorialDelUsuario() throws Exception {
        cargarPersonas();
        perfil(ANALISTA, "{}").andExpect(status().isOk());                          // sin filtros: no se registra
        perfil(ANALISTA, "{\"genero\":\"FEMENINO\",\"edadMin\":60}").andExpect(status().isOk());
        mvc.perform(get("/api/queries/history").with(ANALISTA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].criterios.genero").value("FEMENINO"))
                .andExpect(jsonPath("$[0].criterios.edadMin").value(60));
    }
}
