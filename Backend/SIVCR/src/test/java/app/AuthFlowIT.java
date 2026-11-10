package app;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import model.PasswordHasher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Prueba de integración del inicio y cierre de sesión contra PostgreSQL REAL en contenedor y con la cadena de
 * seguridad real (no el user(...) de las otras pruebas de integración): inicia sesión por POST /api/auth/login y
 * usa el token devuelto en las demás llamadas.
 *
 * Requiere Docker. Se ejecuta con "mvn verify" (Failsafe), no con "mvn test".
 */
@SpringBootTest(properties = "sivcr.auth.iteraciones=1000") // pocas vueltas de PBKDF2: la prueba no debe tardar
@AutoConfigureMockMvc
@Testcontainers
class AuthFlowIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PasswordHasher hasher;

    @BeforeEach
    void partirDeCero() {
        // los ids 9100-9199 son de esta prueba
        jdbc.update("DELETE FROM query_history WHERE usuario_id BETWEEN 9100 AND 9199");
        jdbc.update("DELETE FROM app_user WHERE id BETWEEN 9100 AND 9199");
        insertar(9101L, "Ana Admin", "ana.it@sivcr.test", "Clave-Ana-1", "ADMIN", true);
        insertar(9102L, "Luis Analista", "luis.it@sivcr.test", "Clave-Luis-1", "ANALISTA", true);
        insertar(9103L, "Pedro Inactivo", "pedro.it@sivcr.test", "Clave-Pedro-1", "ANALISTA", false);
    }

    private void insertar(long id, String nombre, String correo, String contrasena, String rol, boolean activo) {
        jdbc.update("INSERT INTO app_user (id, name, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?, ?)",
                id, nombre, correo, hasher.hash(contrasena), rol, activo);
    }

    private ResultActions intentarLogin(String correo, String contrasena) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"correo\":\"" + correo + "\",\"contrasena\":\"" + contrasena + "\"}"));
        // sin csrf() a propósito: el login no lo requiere
    }

    private String login(String correo, String contrasena) throws Exception {
        String cuerpo = intentarLogin(correo, contrasena).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
        return "Bearer " + JsonPath.<String>read(cuerpo, "$.token");
    }

    @Test
    void elLoginDevuelveElTokenYElUsuarioConElContratoDelFrontend() throws Exception {
        intentarLogin("luis.it@sivcr.test", "Clave-Luis-1")
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.token", not(emptyString())))
                .andExpect(jsonPath("$.usuario.id").value(9102))
                .andExpect(jsonPath("$.usuario.nombre").value("Luis Analista"))
                .andExpect(jsonPath("$.usuario.correo").value("luis.it@sivcr.test"))
                .andExpect(jsonPath("$.usuario.rol").value("ANALISTA_TRANSITO")); // nombre del rol en el frontend
    }

    @Test
    void lasCredencialesMalasYLasCuentasInactivasDan401ConMensaje() throws Exception {
        intentarLogin("luis.it@sivcr.test", "otra").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.mensaje").value("Correo o contraseña incorrectos."));
        intentarLogin("nadie@sivcr.test", "Clave-Luis-1").andExpect(status().isUnauthorized());
        intentarLogin("pedro.it@sivcr.test", "Clave-Pedro-1").andExpect(status().isUnauthorized());
    }

    @Test
    void sinTokenOConTokenFalsoLaApiRespondeCon401() throws Exception {
        mvc.perform(get("/api/queries/history")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/queries/history").header("Authorization", "Bearer inventado"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/queries/history").header("Authorization", "Bearer mock-jwt-1")) // el token falso del antiguo login simulado ya no existe
                .andExpect(status().isUnauthorized());
    }

    @Test
    void elTokenAbreLosEndpointsSegunElRolDelUsuario() throws Exception {
        String admin = login("ana.it@sivcr.test", "Clave-Ana-1");
        String analista = login("luis.it@sivcr.test", "Clave-Luis-1");

        mvc.perform(get("/api/ingestion/history").header("Authorization", admin)).andExpect(status().isOk());
        mvc.perform(get("/api/ingestion/history").header("Authorization", analista)).andExpect(status().isForbidden());
        mvc.perform(get("/api/queries/history").header("Authorization", analista)).andExpect(status().isOk());
    }

    @Test
    void lasConsultasQuedanADeNombreDelUsuarioDeLaSesion() throws Exception {
        String analista = login("luis.it@sivcr.test", "Clave-Luis-1");
        mvc.perform(post("/api/records/search").header("Authorization", analista)
                .contentType(MediaType.APPLICATION_JSON).content("{\"anio\":2024}")).andExpect(status().isOk());
        mvc.perform(get("/api/queries/history").header("Authorization", analista))
                .andExpect(jsonPath("$[0].resumen").value("2024"));
        Integer deLuis = jdbc.queryForObject("SELECT count(*) FROM query_history WHERE usuario_id = 9102", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, deLuis);
    }

    @Test
    void cerrarSesionInvalidaElToken() throws Exception {
        String token = login("luis.it@sivcr.test", "Clave-Luis-1");
        mvc.perform(post("/api/auth/logout").header("Authorization", token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/queries/history").header("Authorization", token)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout").header("Authorization", token)).andExpect(status().isUnauthorized());
    }
}
