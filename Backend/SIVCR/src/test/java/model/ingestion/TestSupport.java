package model.ingestion;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import enums.LoadResult;
import enums.UserRole;
import model.User;
import model.ingestion.parser.FileParserFactory;
import model.ingestion.profile.MappingProfile;
import model.ingestion.profile.ProfileParser;
import model.ingestion.profile.MappingProfileCatalog;
import model.ingestion.profile.RecordKind;

/**
 * Soporte de pruebas. TODOS los datos de aquí son SINTÉTICOS (inventados para probar): no provienen de COSEVI,
 * INEC ni de ninguna otra fuente, aunque imiten sus columnas y codificaciones.
 */
final class TestSupport {

    static final User ADMIN = new User(1L, "Ana Administradora", "admin@sivcr.go.cr", "x", UserRole.ADMIN);

    /** Encabezado real de COSEVI (siniestros). */
    static final String ENC_SINIESTROS = "Clase de accidente;Tipo de accidente;Año;Hora;Hora recodificada;Provincia ;"
            + "Cantón;Distrito;Ruta;Kilómetro;Rural o urbano;Calzada vertical;Calzada horizontal;Tipo de calzada;"
            + "Tipo de circulación;Estado del tiempo;Estado de la calzada;Región Mideplan;Tipo ruta;Día ;Mes ";

    private static final String[] BASE_SINIESTRO = {"Solo heridos leves", "Vuelco", "2024", "20:00-20:59", "18:00-23:59",
            "Heredia", "Santo Domingo", "San Miguel", "32", "7", "Urbana", "Plano", "Recta", "Asfalto", "Por detrás",
            "Buen tiempo", "Buena", "Central", "Nacional", "3.Martes", "G. Julio"};

    /** Encabezado real de COSEVI (personas), con el doble espacio de "Vehiculo en  el que viajaba". */
    static final String ENC_PERSONAS = "Rol;Tipo de lesión;Edad;Sexo;Vehiculo en  el que viajaba;Año;Provincia ;Cantón ;"
            + "Distrito;Día;Mes;Edad quinquenal";

    private static final String[] BASE_PERSONA = {"Conductor", "Herido leve", "28", "Hombre", "Automóvil", "2024",
            "San José", "Moravia", "San Vicente", "6.Viernes", "A. Enero", "De 25 a 29"};

    private TestSupport() {
    }

    // ---- perfiles ----

    static MappingProfile perfil(String id) {
        try (InputStream in = TestSupport.class.getResourceAsStream("/ingestion/profiles/" + id + ".yml")) {
            if (in == null) {
                throw new IllegalStateException("No se encontró el perfil " + id);
            }
            return ProfileParser.leer(in, id);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static MappingProfile perfilDesdeYaml(String yaml) {
        return ProfileParser.leer(new ByteArrayInputStream(yaml.getBytes(StandardCharsets.UTF_8)), "prueba");
    }

    // ---- filas de texto ----

    /** Una fila de siniestro válida; cambios = "Encabezado=valor" para modificar columnas. */
    static String siniestro(String... cambios) {
        return fila(ENC_SINIESTROS, BASE_SINIESTRO, cambios);
    }

    static String persona(String... cambios) {
        return fila(ENC_PERSONAS, BASE_PERSONA, cambios);
    }

    private static String fila(String encabezado, String[] base, String[] cambios) {
        String[] columnas = encabezado.split(";", -1);
        Map<String, String> valores = new LinkedHashMap<>();
        for (int i = 0; i < columnas.length; i++) {
            valores.put(columnas[i].trim(), base[i]);
        }
        for (String cambio : cambios) {
            int igual = cambio.indexOf('=');
            String columna = cambio.substring(0, igual).trim();
            if (!valores.containsKey(columna)) {
                throw new IllegalArgumentException("Columna desconocida: " + columna);
            }
            valores.put(columna, cambio.substring(igual + 1));
        }
        return String.join(";", valores.values());
    }

    static byte[] csv(Charset cs, String encabezado, String... filas) {
        List<String> lineas = new ArrayList<>();
        lineas.add(encabezado);
        lineas.addAll(List.of(filas));
        return (String.join("\r\n", lineas) + "\r\n").getBytes(cs);
    }

    /** Como el archivo real de COSEVI: ISO-8859-1. */
    static byte[] csvLatin1(String encabezado, String... filas) {
        return csv(StandardCharsets.ISO_8859_1, encabezado, filas);
    }

    /** Fila cruda ya separada, con las claves de columna normalizadas, como la entregaría un parser. */
    static SinisterBruteData bruta(int numeroFila, String encabezado, String fila) {
        String[] columnas = encabezado.split(";", -1);
        String[] valores = fila.split(";", -1);
        Map<String, String> mapa = new LinkedHashMap<>();
        for (int i = 0; i < columnas.length; i++) {
            mapa.put(TextNormalizer.clave(columnas[i]), TextNormalizer.limpiar(i < valores.length ? valores[i] : ""));
        }
        return new SinisterBruteData(numeroFila, mapa, columnas.length != valores.length);
    }

    // ---- ensamblado del manager con repositorios en memoria ----

    static IngestionManager manager(MemLogs logs, MemRecords registros, int tamanoLote, int maxErrores) {
        List<MappingProfile> perfiles = List.of(perfil("cosevi-siniestros"), perfil("cosevi-personas"),
                perfil("inec-defunciones"), perfil("mopt-red-vial"), perfil("imn-clima-open-meteo"));
        return new IngestionManager(new FileParserFactory(), new MappingProfileCatalog(perfiles), logs,
                registros, GeoBounds.COSTA_RICA, tamanoLote, maxErrores);
    }

    static final class MemLogs implements IngestionLogRepository {
        final List<IngestionLog> almacen = new CopyOnWriteArrayList<>();
        final Map<Long, QualityReport> reportes = new ConcurrentHashMap<>();
        private final AtomicLong secuencia = new AtomicLong();

        @Override
        public synchronized IngestionLog save(IngestionLog log) {
            IngestionLog guardado = log.id() == null ? log.conId(secuencia.incrementAndGet()) : log;
            almacen.removeIf(x -> x.id().equals(guardado.id()));
            almacen.add(guardado);
            return guardado;
        }

        @Override
        public List<IngestionLog> saveAll(Collection<IngestionLog> entidades) {
            List<IngestionLog> r = new ArrayList<>();
            entidades.forEach(e -> r.add(save(e)));
            return r;
        }

        @Override
        public long count() {
            return almacen.size();
        }

        @Override
        public Optional<IngestionLog> findById(long id) {
            return almacen.stream().filter(l -> l.id() == id).findFirst();
        }

        @Override
        public Optional<IngestionLog> findCargaPreviaPorChecksum(String checksum) {
            return almacen.stream()
                    .filter(l -> checksum.equals(l.checksum())
                            && (l.resultado() == LoadResult.EXITOSA || l.resultado() == LoadResult.PARCIAL))
                    .max(Comparator.comparing(IngestionLog::id));
        }

        @Override
        public List<IngestionLog> findAllPorFechaDesc() {
            List<IngestionLog> copia = new ArrayList<>(almacen);
            copia.sort(Comparator.comparing(IngestionLog::id).reversed());
            return copia;
        }

        @Override
        public QualityReport guardarReporte(QualityReport r) {
            reportes.put(r.idCarga(), r);
            return r;
        }

        @Override
        public Optional<QualityReport> findReporte(long idCarga) {
            return Optional.ofNullable(reportes.get(idCarga));
        }
    }

    static final class MemRecords implements RecordRepository {
        final List<NormalizedRecord> filas = Collections.synchronizedList(new ArrayList<>());
        /** Tamaño de cada llamada a saveAll (para comprobar el procesamiento por lotes). */
        final List<Integer> lotes = Collections.synchronizedList(new ArrayList<>());
        final Set<Long> purgados = ConcurrentHashMap.newKeySet();
        volatile Consumer<List<NormalizedRecord>> alGuardar = lote -> { };

        List<NormalizedRecord> siniestros() {
            return filas.stream().filter(f -> f.tipo() == RecordKind.SINISTER).toList();
        }

        List<NormalizedRecord> victimas() {
            return filas.stream().filter(f -> f.tipo() == RecordKind.VICTIM).toList();
        }

        @Override
        public NormalizedRecord save(NormalizedRecord r) {
            saveAll(List.of(r));
            return r;
        }

        @Override
        public List<NormalizedRecord> saveAll(Collection<NormalizedRecord> entidades) {
            List<NormalizedRecord> lote = List.copyOf(entidades);
            alGuardar.accept(lote);
            filas.addAll(lote);
            lotes.add(lote.size());
            return lote;
        }

        @Override
        public long count() {
            return filas.size();
        }

        @Override
        public void deleteByIngestionLogId(long id) {
            purgados.add(id);
            filas.removeIf(f -> f.ingestionLogId() == id);
        }
    }
}
