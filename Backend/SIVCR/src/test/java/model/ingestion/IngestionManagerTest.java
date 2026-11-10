package model.ingestion;

import static model.ingestion.TestSupport.ADMIN;
import static model.ingestion.TestSupport.ENC_PERSONAS;
import static model.ingestion.TestSupport.ENC_SINIESTROS;
import static model.ingestion.TestSupport.csvLatin1;
import static model.ingestion.TestSupport.persona;
import static model.ingestion.TestSupport.siniestro;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.DataSource;
import enums.LoadResult;
import enums.QualityStatus;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import model.ingestion.TestSupport.MemLogs;
import model.ingestion.TestSupport.MemRecords;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Flujo completo del dominio (formato -> perfil -> parseo -> validación -> lotes -> reporte -> registro)
 * con repositorios en memoria. Datos 100% sintéticos (ver TestSupport).
 */
class IngestionManagerTest {

    private MemLogs logs;
    private MemRecords registros;
    private IngestionManager manager;

    @BeforeEach
    void preparar() {
        logs = new MemLogs();
        registros = new MemRecords();
        manager = TestSupport.manager(logs, registros, 1000, 1000);
    }

    private IngestionLog cargar(UploadedFile archivo, DataSource fuente) {
        return manager.cargarArchivo(archivo, fuente, ADMIN);
    }

    private static UploadedFile csvSiniestros(String... filas) {
        return UploadedFile.of("siniestros.csv", csvLatin1(ENC_SINIESTROS, filas));
    }

    // ---- resultado de la carga y reporte de calidad (HU 1, 2, 3) ----

    @Test
    void siTodoEsValidoLaCargaEsExitosa() {
        IngestionLog log = cargar(csvSiniestros(siniestro(), siniestro("Provincia=Limón", "Cantón=Pococí"),
                siniestro("Año=2023")), DataSource.COSEVI);

        assertEquals(LoadResult.EXITOSA, log.resultado());
        assertEquals(new QualityCounts(3, 0, 0, 0), log.resumen());
        assertEquals(3, registros.siniestros().size());
        assertTrue(registros.victimas().isEmpty());
        assertTrue(registros.siniestros().stream().allMatch(f -> f.calidad() == QualityStatus.VALIDO));
        assertTrue(log.mensaje().toLowerCase().contains("exitosa"));

        QualityReport reporte = manager.reporteCalidad(log.id()).orElseThrow();
        assertEquals(3, reporte.validos());
        assertTrue(reporte.errores().isEmpty());
    }

    @Test
    void elRegistroDeLaCargaGuardaFechaUsuarioFuenteYResultado() {
        IngestionLog log = cargar(csvSiniestros(siniestro()), DataSource.COSEVI);

        IngestionLog guardado = logs.findById(log.id()).orElseThrow();
        assertNotNull(guardado.fecha());
        assertEquals("Ana Administradora", guardado.usuario());
        assertEquals(1L, guardado.usuarioId());
        assertEquals(DataSource.COSEVI, guardado.fuente());
        assertEquals(LoadResult.EXITOSA, guardado.resultado());
        assertEquals("siniestros.csv", guardado.archivo());
        assertEquals("cosevi-siniestros", guardado.perfil());
        assertEquals(64, guardado.checksum().length());
    }

    @Test
    void conIncompletosYCorruptosLaCargaEsParcialYSoloSeGuardanValidosEIncompletos() {
        IngestionLog log = cargar(csvSiniestros(
                siniestro(),                       // fila 2: válida
                siniestro("Provincia="),           // fila 3: incompleta
                siniestro("Año=abc"),              // fila 4: corrupta
                siniestro("Provincia=Narnia"),     // fila 5: corrupta
                siniestro("Año=2022")),            // fila 6: válida
                DataSource.COSEVI);

        assertEquals(LoadResult.PARCIAL, log.resultado());
        assertEquals(new QualityCounts(2, 1, 2, 0), log.resumen());
        assertEquals(3, registros.siniestros().size());
        assertEquals(2, registros.siniestros().stream().filter(f -> f.calidad() == QualityStatus.VALIDO).count());
        assertEquals(1, registros.siniestros().stream().filter(f -> f.calidad() == QualityStatus.INCOMPLETO).count());

        List<String> errores = manager.reporteCalidad(log.id()).orElseThrow().errores();
        assertEquals(3, errores.size());
        assertTrue(errores.get(0).startsWith("Fila 3:"));
        assertTrue(errores.get(1).startsWith("Fila 4:"));
        assertTrue(errores.get(2).startsWith("Fila 5:"));
        assertTrue(log.mensaje().contains("parcial"));
    }

    @Test
    void siNingunRegistroSePuedeGuardarLaCargaFalla() {
        IngestionLog log = cargar(csvSiniestros(siniestro("Año=x"), siniestro("Provincia=Narnia")), DataSource.COSEVI);

        assertEquals(LoadResult.FALLIDA, log.resultado());
        assertEquals(new QualityCounts(0, 0, 2, 0), log.resumen());
        assertTrue(registros.siniestros().isEmpty());
        assertEquals(2, manager.reporteCalidad(log.id()).orElseThrow().corruptos());
        assertTrue(log.mensaje().contains("ningún registro"));
    }

    @Test
    void losCorruptosNuncaSePersistenPeroSiQuedanContadosYReportados() {
        IngestionLog log = cargar(csvSiniestros(siniestro(), siniestro("Hora=99:99")), DataSource.COSEVI);
        assertEquals(1, registros.siniestros().size());
        assertEquals(1, log.resumen().corruptos());
        assertEquals(1, manager.reporteCalidad(log.id()).orElseThrow().errores().size());
    }

    @Test
    void decodificaElArchivoEnIso88591YNormalizaLosValores() {
        cargar(csvSiniestros(siniestro("Provincia=Limón", "Cantón=Pérez Zeledón", "Día=7.Sábado", "Mes=D. Abril")),
                DataSource.COSEVI);

        NormalizedRecord r = registros.siniestros().get(0);
        assertEquals("LIMON", r.campos().get("provincia"));
        assertEquals("Pérez Zeledón", r.campos().get("canton"));
        assertEquals("SABADO", r.campos().get("dia_semana"));
        assertEquals((short) 4, r.campos().get("mes"));
        assertEquals(r.ingestionLogId(), 1L);
        assertEquals(2, r.fila());
    }

    // ---- fuente y perfil de mapeo (HU 4) ----

    @Test
    void elArchivoDePersonasSeEnviaALaTablaDeVictimas() {
        IngestionLog log = cargar(UploadedFile.of("personas.csv", csvLatin1(ENC_PERSONAS,
                persona(), persona("Tipo de lesión=Lesión Ignorada"))), DataSource.COSEVI);

        assertEquals("cosevi-personas", log.perfil());
        assertEquals(LoadResult.PARCIAL, log.resultado());
        assertEquals(new QualityCounts(1, 1, 0, 0), log.resumen());
        assertTrue(registros.siniestros().isEmpty());
        assertEquals(2, registros.victimas().size());
        assertEquals(QualityStatus.VALIDO, registros.victimas().get(0).calidad());
        assertEquals(QualityStatus.INCOMPLETO, registros.victimas().get(1).calidad());
    }

    @Test
    void elPerfilSeEligePorLosEncabezadosDelArchivo() {
        assertEquals("cosevi-siniestros", cargar(csvSiniestros(siniestro()), DataSource.COSEVI).perfil());
        assertEquals("cosevi-personas",
                cargar(UploadedFile.of("p.csv", csvLatin1(ENC_PERSONAS, persona())), DataSource.COSEVI).perfil());
    }

    @Test
    void unArchivoConOtrasColumnasFallaYDiceCualesFaltan() {
        UploadedFile archivo = UploadedFile.of("raro.csv",
                "uno;dos;tres\r\n1;2;3\r\n".getBytes(StandardCharsets.UTF_8));
        IngestionLog log = cargar(archivo, DataSource.COSEVI);

        assertEquals(LoadResult.FALLIDA, log.resultado());
        assertTrue(log.mensaje().contains("no coincide con ningún perfil"), log.mensaje());
        assertTrue(log.mensaje().contains("Clase de accidente") || log.mensaje().contains("Rol"), log.mensaje());
        assertTrue(registros.siniestros().isEmpty() && registros.victimas().isEmpty());
    }

    @Test
    void moptEImnSeReconocenPeroTodaviaNoSePuedenCargar() {
        IngestionLog mopt = cargar(UploadedFile.of("capa.json", "{\"features\": []}".getBytes(StandardCharsets.UTF_8)),
                DataSource.MOPT);
        assertEquals(LoadResult.FALLIDA, mopt.resultado());
        assertTrue(mopt.mensaje().contains("todavía no se puede cargar"), mopt.mensaje());

        IngestionLog imn = cargar(UploadedFile.of("clima.csv", "time,temperature_2m\r\n2024-01-01T00:00,25\r\n"
                .getBytes(StandardCharsets.UTF_8)), DataSource.IMN);
        assertEquals(LoadResult.FALLIDA, imn.resultado());
        assertTrue(imn.mensaje().contains("todavía no se puede cargar"), imn.mensaje());
    }

    @Test
    void unaFuenteQueNoAdmiteElFormatoLoRechaza() {
        IngestionLog log = cargar(UploadedFile.of("datos.json", "[{\"a\": 1}]".getBytes(StandardCharsets.UTF_8)),
                DataSource.INEC);
        assertEquals(LoadResult.FALLIDA, log.resultado());
        assertTrue(log.mensaje().contains("no admite archivos JSON"), log.mensaje());
    }

    // ---- validación de formato antes de procesar ----

    @Test
    void unFormatoNoSoportadoFallaSinProcesarRegistrosPeroQuedaRegistrado() {
        IngestionLog log = cargar(UploadedFile.of("reporte.pdf", "%PDF-1.4".getBytes(StandardCharsets.UTF_8)),
                DataSource.COSEVI);

        assertEquals(LoadResult.FALLIDA, log.resultado());
        assertTrue(log.mensaje().contains("CSV, JSON y Excel"));
        assertEquals(1, manager.historial().size());
        assertEquals(List.of(log.mensaje()), manager.reporteCalidad(log.id()).orElseThrow().errores());
        assertTrue(registros.siniestros().isEmpty());
    }

    @Test
    void unArchivoVacioOSoloConEncabezadoFalla() {
        IngestionLog vacio = cargar(UploadedFile.of("vacio.csv", new byte[0]), DataSource.COSEVI);
        assertEquals(LoadResult.FALLIDA, vacio.resultado());

        IngestionLog soloEncabezado = cargar(csvSiniestros(), DataSource.COSEVI);
        assertEquals(LoadResult.FALLIDA, soloEncabezado.resultado());
        assertTrue(soloEncabezado.mensaje().contains("no contiene registros"));
    }

    // ---- JSON y Excel con las columnas de COSEVI ----

    private static String aJson(String encabezado, String... filas) {
        String[] columnas = encabezado.split(";", -1);
        List<String> objetos = new ArrayList<>();
        for (String fila : filas) {
            String[] valores = fila.split(";", -1);
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i < columnas.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append('"').append(columnas[i].trim()).append("\":\"").append(valores[i]).append('"');
            }
            objetos.add(sb.append('}').toString());
        }
        return "[" + String.join(",", objetos) + "]";
    }

    private static byte[] aExcel(String encabezado, String... filas) throws IOException {
        try (XSSFWorkbook libro = new XSSFWorkbook(); ByteArrayOutputStream salida = new ByteArrayOutputStream()) {
            Sheet hoja = libro.createSheet("Datos");
            String[] columnas = encabezado.split(";", -1);
            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < columnas.length; i++) {
                cabecera.createCell(i).setCellValue(columnas[i]);
            }
            for (int f = 0; f < filas.length; f++) {
                Row fila = hoja.createRow(f + 1);
                String[] valores = filas[f].split(";", -1);
                for (int i = 0; i < valores.length; i++) {
                    fila.createCell(i).setCellValue(valores[i]);
                }
            }
            libro.write(salida);
            return salida.toByteArray();
        }
    }

    @Test
    void cargaUnJsonConLasColumnasDeCosevi() {
        byte[] json = aJson(ENC_SINIESTROS, siniestro(), siniestro("Año=abc")).getBytes(StandardCharsets.UTF_8);
        IngestionLog log = cargar(UploadedFile.of("siniestros.json", json), DataSource.COSEVI);

        assertEquals(LoadResult.PARCIAL, log.resultado());
        assertEquals(new QualityCounts(1, 0, 1, 0), log.resumen());
        assertEquals(1, registros.siniestros().size());
    }

    @Test
    void cargaUnExcelConLasColumnasDeCosevi() throws IOException {
        byte[] xlsx = aExcel(ENC_SINIESTROS, siniestro(), siniestro("Provincia=Limón"));
        IngestionLog log = cargar(UploadedFile.of("siniestros.xlsx", xlsx), DataSource.COSEVI);

        assertEquals(LoadResult.EXITOSA, log.resultado());
        assertEquals(new QualityCounts(2, 0, 0, 0), log.resumen());
        assertEquals("LIMON", registros.siniestros().get(1).campos().get("provincia"));
    }

    // ---- INEC: filtro por causa de muerte ----

    @Test
    void inecOmiteLasCausasQueNoSonDeTransporteSinContarlasComoErrores() {
        String csv = "anodef,mesdef,provocu,causamuer\r\n2023,5,1,V892\r\n2023,6,2,J189\r\n2023,7,3,V031\r\n";
        IngestionLog log = cargar(UploadedFile.of("defunciones.csv", csv.getBytes(StandardCharsets.UTF_8)),
                DataSource.INEC);

        assertEquals(LoadResult.EXITOSA, log.resultado());
        assertEquals(new QualityCounts(2, 0, 0, 1), log.resumen());
        assertEquals("FALLECIDO", registros.siniestros().get(0).campos().get("severidad"));
        assertTrue(log.mensaje().contains("omitieron 1"));
    }

    @Test
    void siNingunaFilaCumpleElFiltroDelPerfilLaCargaFalla() {
        String csv = "anodef,mesdef,provocu,causamuer\r\n2023,5,1,J189\r\n2023,6,2,I219\r\n";
        IngestionLog log = cargar(UploadedFile.of("defunciones.csv", csv.getBytes(StandardCharsets.UTF_8)),
                DataSource.INEC);
        assertEquals(LoadResult.FALLIDA, log.resultado());
        assertTrue(log.mensaje().contains("Ninguna fila cumple el filtro"), log.mensaje());
    }

    // ---- archivos repetidos ----

    @Test
    void elMismoArchivoNoSePuedeCargarDosVeces() {
        UploadedFile archivo = csvSiniestros(siniestro(), siniestro("Año=2022"));
        IngestionLog primera = cargar(archivo, DataSource.COSEVI);
        IngestionLog segunda = cargar(archivo, DataSource.COSEVI);

        assertEquals(LoadResult.EXITOSA, primera.resultado());
        assertEquals(LoadResult.FALLIDA, segunda.resultado());
        assertTrue(segunda.mensaje().contains("n.º " + primera.id()), segunda.mensaje());
        assertEquals(2, registros.siniestros().size());   // no se duplicaron registros
        assertEquals(2, manager.historial().size()); // pero el intento quedó registrado
    }

    @Test
    void unaCargaFallidaSiSePuedeReintentarConElMismoArchivo() {
        UploadedFile archivo = csvSiniestros(siniestro("Año=x"));
        cargar(archivo, DataSource.COSEVI);
        IngestionLog reintento = cargar(archivo, DataSource.COSEVI);
        assertFalse(reintento.mensaje().contains("ya se cargó"), reintento.mensaje());
        assertEquals(new QualityCounts(0, 0, 1, 0), reintento.resumen());
    }

    @Test
    void elMismoArchivoEnParaleloSoloSeProcesaUnaVez() throws Exception {
        UploadedFile archivo = csvSiniestros(siniestro(), siniestro("Año=2022"));
        CountDownLatch dentro = new CountDownLatch(1);
        CountDownLatch libera = new CountDownLatch(1);
        registros.alGuardar = lote -> {
            dentro.countDown();
            try {
                libera.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        };

        ExecutorService hilo = Executors.newSingleThreadExecutor();
        try {
            Future<IngestionLog> primera = hilo.submit(() -> cargar(archivo, DataSource.COSEVI));
            assertTrue(dentro.await(10, TimeUnit.SECONDS), "la primera carga debía empezar a guardar");

            IngestionLog segunda = cargar(archivo, DataSource.COSEVI);
            assertEquals(LoadResult.FALLIDA, segunda.resultado());
            assertTrue(segunda.mensaje().contains("ya se está procesando"), segunda.mensaje());

            libera.countDown();
            assertEquals(LoadResult.EXITOSA, primera.get(10, TimeUnit.SECONDS).resultado());
            assertEquals(2, registros.siniestros().size());
        } finally {
            libera.countDown();
            hilo.shutdownNow();
        }
    }

    // ---- lotes, límite de errores y fallas a mitad de carga ----

    @Test
    void guardaPorLotesDelTamanoConfigurado() {
        manager = TestSupport.manager(logs, registros, 2, 1000);
        IngestionLog log = cargar(csvSiniestros(siniestro(), siniestro("Año=2019"), siniestro("Año=2020"),
                siniestro("Año=2021"), siniestro("Año=2022")), DataSource.COSEVI);

        assertEquals(LoadResult.EXITOSA, log.resultado());
        assertEquals(List.of(2, 2, 1), registros.lotes);
        assertEquals(5, registros.siniestros().size());
    }

    @Test
    void elReporteGuardaSoloLosPrimerosErroresPeroLosContadoresSonExactos() {
        manager = TestSupport.manager(logs, registros, 1000, 3);
        String[] corruptas = new String[10];
        for (int i = 0; i < corruptas.length; i++) {
            corruptas[i] = siniestro("Año=mal" + i);
        }
        IngestionLog log = cargar(csvSiniestros(corruptas), DataSource.COSEVI);

        QualityReport reporte = manager.reporteCalidad(log.id()).orElseThrow();
        assertEquals(10, reporte.corruptos());
        assertEquals(3, reporte.errores().size());
        assertTrue(reporte.erroresRecortados());
        assertTrue(reporte.errores().get(0).startsWith("Fila 2:"));
    }

    @Test
    void siFallaAMitadDeLaCargaSeBorraLoGuardadoYSeRegistraLaFalla() {
        manager = TestSupport.manager(logs, registros, 2, 1000);
        registros.alGuardar = lote -> {
            if (!registros.lotes.isEmpty()) {
                throw new IllegalStateException("fallo simulado de base de datos: dato-sensible-123");
            }
        };
        IngestionLog log = cargar(csvSiniestros(siniestro(), siniestro("Año=2019"), siniestro("Año=2020"),
                siniestro("Año=2021")), DataSource.COSEVI);

        assertEquals(LoadResult.FALLIDA, log.resultado());
        assertTrue(registros.siniestros().isEmpty(), "no debe quedar una carga a medias");
        assertTrue(registros.purgados.contains(log.id()));
        assertTrue(log.mensaje().contains("error inesperado"));
        assertFalse(log.mensaje().contains("dato-sensible-123"), "el detalle técnico no se muestra al usuario");
        assertEquals(LoadResult.FALLIDA, logs.findById(log.id()).orElseThrow().resultado());
    }

    // ---- historial (HU 5) ----

    @Test
    void elHistorialListaLasCargasDeLaMasRecienteALaMasAntigua() {
        IngestionLog primera = cargar(csvSiniestros(siniestro()), DataSource.COSEVI);
        IngestionLog segunda = cargar(csvSiniestros(siniestro("Año=2019")), DataSource.COSEVI);
        IngestionLog tercera = cargar(UploadedFile.of("x.pdf", new byte[] {'%', 'P'}), DataSource.MOPT);

        List<IngestionLog> historial = manager.historial();
        assertEquals(List.of(tercera.id(), segunda.id(), primera.id()), historial.stream().map(IngestionLog::id).toList());
        assertEquals(DataSource.MOPT, historial.get(0).fuente());
    }

    @Test
    void sinReporteParaUnaCargaInexistente() {
        assertTrue(manager.reporteCalidad(999).isEmpty());
    }
}
