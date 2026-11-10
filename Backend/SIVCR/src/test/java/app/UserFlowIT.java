package app;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
 * Prueba de integración de la gestión de usuarios (HU 29) contra PostgreSQL REAL en contenedor y con la cadena de
 * seguridad real: se inicia sesión por POST /api/auth/login y se usa el token. Comprueba también que una cuenta
 * creada por la API puede entrar de verdad y que una desactivada ya no.
 *
 * Requiere Docker. Se ejecuta con "mvn verify" (Failsafe), no con "mvn test".
 */
@SpringBootTest(properties = "sivcr.auth.iteraciones=1000") // pocas vueltas de PBKDF2: la prueba no debe tardar
@AutoConfigureMockMvc
@Testcontainers
class UserFlowIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PasswordHasher hasher;

    private String admin;
    private String analista;

    @BeforeEach
    void partirDeCero() throws Exception {
        // los ids 9200-9299 son de esta prueba; las cuentas creadas por la API se borran por su correo
        jdbc.update("DELETE FROM app_user WHERE id BETWEEN 9200 AND 9299 OR email LIKE '%@usuarios-it.test'");
        insertar(9201L, "Ana Admin", "ana@usuarios-it.test", "Clave-Ana-1", "ADMIN");
        insertar(9202L, "Luis Analista", "luis@usuarios-it.test", "Clave-Luis-1", "ANALISTA");
        // las cuentas que se crean por la API toman su id de la secuencia: se pone lejos de los ids fijos
        jdbc.queryForObject("SELECT setval(pg_get_serial_sequence('app_user', 'id'), "
                + "GREATEST((SELECT MAX(id) FROM app_user), 9300))", Long.class);
        admin = login("ana@usuarios-it.test", "Clave-Ana-1");
        analista = login("luis@usuarios-it.test", "Clave-Luis-1");
    }

    private void insertar(long id, String nombre, String correo, String contrasena, String rol) {
        jdbc.update("INSERT INTO app_user (id, name, email, password_hash, rol) VALUES (?, ?, ?, ?, ?)",
                id, nombre, correo, hasher.hash(contrasena), rol);
    }

    private ResultActions intentarLogin(String correo, String contrasena) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"correo\":\"" + correo + "\",\"contrasena\":\"" + contrasena + "\"}"));
    }

    private String login(String correo, String contrasena) throws Exception {
        String cuerpo = intentarLogin(correo, contrasena).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
        return "Bearer " + JsonPath.<String>read(cuerpo, "$.token");
    }

    private static String cuerpo(String nombre, String correo, String rol, String contrasena) {
        return "{\"nombre\":\"" + nombre + "\",\"correo\":\"" + correo + "\",\"rol\":\"" + rol + "\""
                + (contrasena == null ? "" : ",\"contrasena\":\"" + contrasena + "\"") + "}";
    }

    private ResultActions crear(String token, String nombre, String correo, String rol, String contrasena)
            throws Exception {
        return mvc.perform(post("/api/users").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo(nombre, correo, rol, contrasena)));
    }

    private long idCreado(ResultActions respuesta) throws Exception {
        return ((Number) JsonPath.read(respuesta.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    @Test
    void soloLaAdministracionPuedeGestionarUsuarios() throws Exception {
        mvc.perform(get("/api/users")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users").header("Authorization", analista)).andExpect(status().isForbidden());
        crear(analista, "Carla Nueva", "carla@usuarios-it.test", "CONSULTOR_PUBLICO", "Clave-Carla-1")
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/users/9202/active").header("Authorization", analista)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isForbidden());
        Integer cuentas = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = 'carla@usuarios-it.test'",
                Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(0, cuentas);
    }

    @Test
    void creaUnaCuentaQuePuedeIniciarSesionYNuncaDevuelveLaContrasena() throws Exception {
        ResultActions creada = crear(admin, "  Carla   Nueva ", " Carla@Usuarios-IT.test ", "CONSULTOR_PUBLICO",
                "Clave-Carla-1")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.nombre").value("Carla Nueva"))
                .andExpect(jsonPath("$.correo").value("carla@usuarios-it.test"))
                .andExpect(jsonPath("$.rol").value("CONSULTOR_PUBLICO"))
                .andExpect(jsonPath("$.activo").value(true))
                .andExpect(jsonPath("$.creadoEn").exists())
                .andExpect(jsonPath("$.contrasena").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        long id = idCreado(creada);

        String guardado = jdbc.queryForObject("SELECT password_hash FROM app_user WHERE id = ?", String.class, id);
        org.junit.jupiter.api.Assertions.assertFalse(guardado.contains("Clave-Carla-1"));

        // y con esa cuenta se entra de verdad, con el rol que se le dio
        intentarLogin("carla@usuarios-it.test", "Clave-Carla-1").andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.id").value(id))
                .andExpect(jsonPath("$.usuario.rol").value("CONSULTOR_PUBLICO"));
    }

    @Test
    void validaLosDatosYRechazaCorreosRepetidos() throws Exception {
        crear(admin, "Carla Nueva", "carla@usuarios-it.test", "CONSULTOR_PUBLICO", "floja")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensaje", containsString("8")));
        crear(admin, "Carla Nueva", "no-es-correo", "CONSULTOR_PUBLICO", "Clave-Carla-1")
                .andExpect(status().isBadRequest());
        crear(admin, "Carla Nueva", "carla@usuarios-it.test", "SUPERUSUARIO", "Clave-Carla-1")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensaje", containsString("Rol")));
        crear(admin, "Carla Nueva", "carla@usuarios-it.test", "CONSULTOR_PUBLICO", null)
                .andExpect(status().isBadRequest());
        crear(admin, "Ana Repetida", "ANA@usuarios-it.test", "ANALISTA_TRANSITO", "Clave-Carla-1")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensaje", containsString("Ya existe")));
        Integer cuentas = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email LIKE '%@usuarios-it.test'",
                Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(2, cuentas, "ninguna de las solicitudes rechazadas creó una cuenta");
    }

    @Test
    void listaTodasLasCuentasIncluidasLasInactivas() throws Exception {
        long id = idCreado(crear(admin, "Zoe Inactiva", "zoe@usuarios-it.test", "ANALISTA_TRANSITO", "Clave-Zoe-1")
                .andExpect(status().isCreated()));
        mvc.perform(put("/api/users/" + id + "/active").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isOk());
        mvc.perform(get("/api/users").header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.correo=='zoe@usuarios-it.test')].activo").value(false))
                .andExpect(jsonPath("$[?(@.correo=='ana@usuarios-it.test')].rol").value("ADMIN"))
                .andExpect(jsonPath("$[?(@.correo=='luis@usuarios-it.test')].rol").value("ANALISTA_TRANSITO"))
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist());
    }

    @Test
    void editaNombreCorreoRolYContrasenaYCierraLasSesionesDeLaPersonaEditada() throws Exception {
        String tokenDeLuis = analista;
        mvc.perform(put("/api/users/9202").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo("Luis Consultor", "luis.nuevo@usuarios-it.test", "CONSULTOR_PUBLICO", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre").value("Luis Consultor"))
                .andExpect(jsonPath("$.correo").value("luis.nuevo@usuarios-it.test"))
                .andExpect(jsonPath("$.rol").value("CONSULTOR_PUBLICO"));
        // contraseña vacía = la misma de antes; el correo nuevo ya es el de entrada
        intentarLogin("luis.nuevo@usuarios-it.test", "Clave-Luis-1").andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.rol").value("CONSULTOR_PUBLICO"));
        intentarLogin("luis@usuarios-it.test", "Clave-Luis-1").andExpect(status().isUnauthorized());
        // la sesión que tenía abierta se cerró: con el rol nuevo debe volver a entrar
        mvc.perform(get("/api/queries/history").header("Authorization", tokenDeLuis)).andExpect(status().isUnauthorized());

        mvc.perform(put("/api/users/9202").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo("Luis Consultor", "luis.nuevo@usuarios-it.test", "CONSULTOR_PUBLICO", "Otra-Clave-9")))
                .andExpect(status().isOk());
        intentarLogin("luis.nuevo@usuarios-it.test", "Clave-Luis-1").andExpect(status().isUnauthorized());
        intentarLogin("luis.nuevo@usuarios-it.test", "Otra-Clave-9").andExpect(status().isOk());

        mvc.perform(put("/api/users/9202").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo("Luis", "ana@usuarios-it.test", "ANALISTA_TRANSITO", null)))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/users/987654").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo("Nadie Existe", "nadie@usuarios-it.test", "ANALISTA_TRANSITO", null)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.mensaje", not("")));
    }

    @Test
    void unaCuentaDesactivadaPierdeLaSesionYNoPuedeEntrarHastaReactivarla() throws Exception {
        mvc.perform(put("/api/users/9202/active").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.activo").value(false));
        mvc.perform(get("/api/queries/history").header("Authorization", analista)).andExpect(status().isUnauthorized());
        intentarLogin("luis@usuarios-it.test", "Clave-Luis-1").andExpect(status().isUnauthorized());

        mvc.perform(put("/api/users/9202/active").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.activo").value(true));
        intentarLogin("luis@usuarios-it.test", "Clave-Luis-1").andExpect(status().isOk());

        mvc.perform(put("/api/users/9202/active").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void protegeAlSistemaDeQuedarseSinAdministradoresYDeAutoBloqueos() throws Exception {
        // Ana se desactiva o se degrada a sí misma: no
        mvc.perform(put("/api/users/9201/active").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/users/9201").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo("Ana Admin", "ana@usuarios-it.test", "CONSULTOR_PUBLICO", null)))
                .andExpect(status().isBadRequest());
        // sigue pudiendo editar sus otros datos y conserva su sesión
        mvc.perform(put("/api/users/9201").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo("Ana M. Admin", "ana@usuarios-it.test", "ADMIN", null)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nombre").value("Ana M. Admin"));
        mvc.perform(get("/api/users").header("Authorization", admin)).andExpect(status().isOk());

        // con una segunda administradora, la primera ya puede ser desactivada por ella; la segunda, que queda como
        // única, tampoco puede desactivarse a sí misma
        long bea = idCreado(crear(admin, "Bea Admin", "bea@usuarios-it.test", "ADMIN", "Clave-Bea-1")
                .andExpect(status().isCreated()));
        String tokenBea = login("bea@usuarios-it.test", "Clave-Bea-1");
        mvc.perform(put("/api/users/9201/active").header("Authorization", tokenBea)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isOk());
        mvc.perform(get("/api/users").header("Authorization", admin)).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/users/" + bea + "/active").header("Authorization", tokenBea)
                .contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void noHayBorradoDeUsuarios() throws Exception {
        // las cuentas se desactivan: la carga, la consulta y el historial las referencian
        mvc.perform(delete("/api/users/9202").header("Authorization", admin)).andExpect(status().is4xxClientError());
        Integer cuentas = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE id = 9202", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(1, cuentas);
    }
}
