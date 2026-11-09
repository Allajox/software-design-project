package app;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
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
 * Prueba de integración del flujo completo contra PostgreSQL REAL en contenedor: migraciones de Flyway,
 * validación de las entidades JPA contra el esquema, inserción por lotes, seguridad por rol y los tres endpoints.
 *
 * Requiere Docker. Se ejecuta con "mvn verify" (Failsafe), no con "mvn test". Datos 100% sintéticos
 * (src/test/resources/muestras). El archivo .xlsx y el de volumen se generan al ejecutar.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class IngestionFlowIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final RequestPostProcessor ADMIN = user("admin@sivcr.go.cr").roles("ADMIN");
    private static final RequestPostProcessor ANALISTA = user("analista@sivcr.go.cr").roles("ANALISTA");

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void partirDeCero() {
        jdbc.update("INSERT INTO app_user (id, name, email, password_hash, rol) "
                + "VALUES (1, 'Ana Administradora', 'admin@sivcr.go.cr', '{noop}x', 'ADMIN') ON CONFLICT DO NOTHING");
        jdbc.update("DELETE FROM victim");
        jdbc.update("DELETE FROM sinister");
        jdbc.update("DELETE FROM quality_report");
        jdbc.update("DELETE FROM ingestion_log");
    }

    // ---- utilidades ----

    private static MockMultipartHttpServletRequestBuilder subida(String nombre, String tipo, byte[] contenido,
                                                                 String fuente) {
        MockMultipartHttpServletRequestBuilder peticion = multipart("/api/ingestion/upload");
        peticion.file(new MockMultipartFile("file", nombre, tipo, contenido));
        peticion.param("fuente", fuente); // param() devuelve el tipo padre, por eso no se encadena
        return peticion;
    }

    private static byte[] muestra(String nombre) throws Exception {
        return new ClassPathResource("muestras/" + nombre).getContentAsByteArray();
    }

    private long subir(String nombre, String tipo, byte[] contenido, String fuente) throws Exception {
        MvcResult r = mvc.perform(subida(nombre, tipo, contenido, fuente).with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andReturn();
        return ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$.id")).longValue();
    }

    private long contar(String sql, Object... parametros) {
        return jdbc.queryForObject(sql, Long.class, parametros);
    }

    // ---- HU 1, 2, 3: carga, validación y reporte ----

    @Test
    void cargaCoseviSiniestrosYGuardaValidosEIncompletosConSuCalidad() throws Exception {
        MvcResult r = mvc.perform(subida("siniestros.csv", "text/csv", muestra("SINTETICO-cosevi-siniestros.csv"), "COSEVI")
                        .with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("PARCIAL"))
                .andExpect(jsonPath("$.fuente").value("COSEVI"))
                .andExpect(jsonPath("$.usuario").value("Ana Administradora"))
                .andExpect(jsonPath("$.perfil").value("cosevi-siniestros"))
                .andExpect(jsonPath("$.resumen.validos").value(3))
                .andExpect(jsonPath("$.resumen.incompletos").value(1))
                .andExpect(jsonPath("$.resumen.corruptos").value(2))
                .andReturn();
        long id = ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$.id")).longValue();

        assertEquals(3L, contar("select count(*) from sinister where ingestion_log_id = ? and calidad = 'VALIDO'", id));
        assertEquals(1L, contar("select count(*) from sinister where ingestion_log_id = ? and calidad = 'INCOMPLETO'", id));
        assertEquals(4L, contar("select count(*) from sinister where ingestion_log_id = ?", id)); // los corruptos no se guardan

        // valores normalizados del segundo registro de la muestra
        var fila = jdbc.queryForMap("select * from sinister where ingestion_log_id = ? and provincia = 'LIMON'", id);
        assertEquals("CON_MUERTOS_O_GRAVES", fila.get("severidad"));
        assertEquals("SABADO", fila.get("dia_semana"));
        assertEquals("NOCHE", fila.get("franja"));
        assertEquals("LLUVIA", fila.get("clima"));
        assertEquals("RESBALADIZA", fila.get("calzada"));
        assertEquals(2023, ((Number) fila.get("anio")).intValue());
        assertEquals(4, ((Number) fila.get("mes")).intValue());
        assertEquals(22, ((Number) fila.get("hora")).intValue());
        assertEquals(43.0, ((Number) fila.get("km")).doubleValue());

        mvc.perform(get("/api/ingestion/{id}/quality-report", id).with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.validos").value(3))
                .andExpect(jsonPath("$.incompletos").value(1))
                .andExpect(jsonPath("$.corruptos").value(2))
                .andExpect(jsonPath("$.errores", hasSize(3)))
                .andExpect(jsonPath("$.errores[0]", containsString("Fila 5")));
    }

    @Test
    void cargaCoseviPersonasSinEnlazarlasAUnSiniestro() throws Exception {
        long id = subir("personas.csv", "text/csv", muestra("SINTETICO-cosevi-personas.csv"), "COSEVI");

        assertEquals(4L, contar("select count(*) from victim where ingestion_log_id = ?", id));
        assertEquals(4L, contar("select count(*) from victim where ingestion_log_id = ? and sinister_id is null", id));
        assertEquals(3L, contar("select count(*) from victim where ingestion_log_id = ? and calidad = 'VALIDO'", id));
        assertEquals(0L, contar("select count(*) from sinister"));
        var fila = jdbc.queryForMap("select * from victim where ingestion_log_id = ? and rol = 'PEATON'", id);
        assertEquals("HERIDO_GRAVE", fila.get("tipo_lesion"));
        assertEquals("FEMENINO", fila.get("genero"));
        assertEquals(67, ((Number) fila.get("edad")).intValue());
    }

    @Test
    void cargaInecFiltrandoPorCausaDeMuerte() throws Exception {
        mvc.perform(subida("defunciones.csv", "text/csv", muestra("SINTETICO-inec-defunciones.csv"), "INEC")
                        .with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("EXITOSA"))
                .andExpect(jsonPath("$.resumen.validos").value(3))
                .andExpect(jsonPath("$.resumen.omitidos").value(2));
        assertEquals(3L, contar("select count(*) from sinister where severidad = 'FALLECIDO'"));
    }

    @Test
    void cargaUnJsonYUnExcel() throws Exception {
        mvc.perform(subida("siniestros.json", "application/json", muestra("SINTETICO-cosevi-siniestros.json"), "COSEVI")
                        .with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("PARCIAL"))
                .andExpect(jsonPath("$.resumen.validos").value(2))
                .andExpect(jsonPath("$.resumen.corruptos").value(1));

        byte[] xlsx;
        try (XSSFWorkbook libro = new XSSFWorkbook(); ByteArrayOutputStream salida = new ByteArrayOutputStream()) {
            Sheet hoja = libro.createSheet("Datos");
            String[] encabezado = {"Clase de accidente", "Tipo de accidente", "Año", "Hora", "Hora recodificada",
                    "Provincia", "Cantón", "Distrito", "Estado del tiempo", "Día", "Mes"};
            String[] valores = {"Solo heridos leves", "Vuelco", "2021", "08:00-08:59", "06:00-11:59", "Cartago",
                    "Paraíso", "Orosi", "Buen tiempo", "5.Jueves", "H. Agosto"};
            Row cab = hoja.createRow(0);
            Row dato = hoja.createRow(1);
            for (int i = 0; i < encabezado.length; i++) {
                cab.createCell(i).setCellValue(encabezado[i]);
                dato.createCell(i).setCellValue(valores[i]);
            }
            libro.write(salida);
            xlsx = salida.toByteArray();
        }
        mvc.perform(subida("siniestros.xlsx",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx, "COSEVI")
                        .with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("EXITOSA"));
        assertEquals(1L, contar("select count(*) from sinister where provincia = 'CARTAGO'"));
    }

    @Test
    void cargaUnArchivoGrandeEnIso88591PorLotes() throws Exception {
        String encabezado = "Clase de accidente;Tipo de accidente;Año;Hora;Hora recodificada;Provincia ;Cantón;Distrito;"
                + "Ruta;Kilómetro;Rural o urbano;Estado del tiempo;Estado de la calzada;Tipo ruta;Día ;Mes ";
        StringBuilder csv = new StringBuilder(encabezado).append("\r\n");
        int filas = 6000;
        for (int i = 0; i < filas; i++) {
            csv.append("Solo heridos leves;Vuelco;").append(2020 + i % 6)
                    .append(";20:00-20:59;18:00-23:59;Limón;Pococí;Guápiles;32;").append(i % 90)
                    .append(";Rural;Lluvia;Buena;Nacional;3.Martes;G. Julio\r\n");
        }
        long inicio = System.nanoTime();
        long id = subir("grande.csv", "text/csv", csv.toString().getBytes(StandardCharsets.ISO_8859_1), "COSEVI");
        long segundos = (System.nanoTime() - inicio) / 1_000_000_000L;

        assertEquals((long) filas, contar("select count(*) from sinister where ingestion_log_id = ?", id));
        assertEquals((long) filas, contar("select count(*) from sinister where provincia = 'LIMON' and canton = 'Pococí'"));
        assertTrue(segundos < 60, "6000 filas tardaron " + segundos + " s");
    }

    // ---- HU 5: historial ----

    @Test
    void elHistorialMuestraFechaUsuarioFuenteYResultadoDeLaMasRecienteALaMasAntigua() throws Exception {
        subir("siniestros.csv", "text/csv", muestra("SINTETICO-cosevi-siniestros.csv"), "COSEVI");
        subir("defunciones.csv", "text/csv", muestra("SINTETICO-inec-defunciones.csv"), "INEC");

        mvc.perform(get("/api/ingestion/history").with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].fuente").value("INEC"))
                .andExpect(jsonPath("$[0].resultado").value("EXITOSA"))
                .andExpect(jsonPath("$[0].usuario").value("Ana Administradora"))
                .andExpect(jsonPath("$[0].fecha").exists())
                .andExpect(jsonPath("$[0].resumen.validos").value(3))
                .andExpect(jsonPath("$[1].fuente").value("COSEVI"))
                .andExpect(jsonPath("$[1].resultado").value("PARCIAL"));
    }

    @Test
    void elMismoArchivoNoSeCargaDosVecesPeroElIntentoQuedaEnElHistorial() throws Exception {
        byte[] contenido = muestra("SINTETICO-cosevi-siniestros.csv");
        subir("siniestros.csv", "text/csv", contenido, "COSEVI");

        mvc.perform(subida("copia.csv", "text/csv", contenido, "COSEVI").with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("FALLIDA"))
                .andExpect(jsonPath("$.mensaje", containsString("ya se cargó")));
        assertEquals(4L, contar("select count(*) from sinister"));
        assertEquals(2L, contar("select count(*) from ingestion_log"));
    }

    @Test
    void unArchivoConFormatoInvalidoFallaYQuedaRegistradoConSuReporte() throws Exception {
        MvcResult r = mvc.perform(subida("reporte.pdf", "application/pdf", "%PDF-1.4".getBytes(StandardCharsets.UTF_8), "COSEVI")
                        .with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("FALLIDA"))
                .andExpect(jsonPath("$.mensaje", containsString("CSV, JSON y Excel")))
                .andReturn();
        long id = ((Number) JsonPath.read(r.getResponse().getContentAsString(), "$.id")).longValue();
        mvc.perform(get("/api/ingestion/{id}/quality-report", id).with(ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errores", hasSize(1)));
    }

    // ---- errores de uso y seguridad (el servidor verifica el rol ADMIN) ----

    @Test
    void soloElAdministradorPuedeIngerirDatos() throws Exception {
        byte[] contenido = muestra("SINTETICO-cosevi-siniestros.csv");

        mvc.perform(subida("s.csv", "text/csv", contenido, "COSEVI").with(ANALISTA).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/ingestion/history").with(ANALISTA)).andExpect(status().isForbidden());
        mvc.perform(get("/api/ingestion/1/quality-report").with(ANALISTA)).andExpect(status().isForbidden());

        // sin autenticar: no hay acceso (el código exacto depende del mecanismo de seguridad vigente)
        int sinSesion = mvc.perform(subida("s.csv", "text/csv", contenido, "COSEVI").with(csrf()))
                .andReturn().getResponse().getStatus();
        assertTrue(sinSesion == 401 || sinSesion == 403 || sinSesion == 302, "estado: " + sinSesion);

        assertEquals(0L, contar("select count(*) from ingestion_log"));
        assertEquals(0L, contar("select count(*) from sinister"));
    }

    @Test
    void rechazaUnaFuenteInvalidaYUnArchivoVacio() throws Exception {
        mvc.perform(subida("s.csv", "text/csv", muestra("SINTETICO-cosevi-siniestros.csv"), "NASA").with(ADMIN).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(subida("vacio.csv", "text/csv", new byte[0], "COSEVI").with(ADMIN).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensaje", containsString("vacío")));
        mvc.perform(get("/api/ingestion/987654/quality-report").with(ADMIN)).andExpect(status().isNotFound());
    }
}
