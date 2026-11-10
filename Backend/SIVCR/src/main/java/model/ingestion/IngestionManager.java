package model.ingestion;

import enums.DataSource;
import enums.FileFormat;
import enums.LoadResult;
import enums.QualityStatus;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import model.ingestion.parser.FileParser;
import model.ingestion.parser.FileParserFactory;
import model.ingestion.profile.MappingProfile;
import model.ingestion.profile.MappingProfileCatalog;
import model.ingestion.profile.RecordKind;

/**
 * Orquesta la ingesta de un archivo: formato -> perfil de la fuente -> parseo por flujo -> validación fila a fila
 * -> persistencia por lotes -> reporte de calidad -> registro de la carga.
 *
 * No depende de Spring ni de la capa web: recibe un UploadedFile y puertos de persistencia.
 *
 * Diferencia con el diagrama: cargarArchivo recibe además el usuario, porque el registro de la carga (HU 5)
 * debe guardar quién la hizo y el dominio no conoce la sesión.
 *
 * Reglas del resultado (LoadResult):
 *  - EXITOSA: todas las filas evaluadas son VALIDO.
 *  - PARCIAL: hay INCOMPLETO o CORRUPTO, pero se guardó al menos una fila (VALIDO o INCOMPLETO).
 *  - FALLIDA: formato inválido, perfil no reconocido, archivo duplicado, error al procesar o ninguna fila guardada.
 * Solo se guardan VALIDO e INCOMPLETO (con su estado); los CORRUPTO únicamente se cuentan y se reportan.
 * Los KPI deben leer solo calidad = 'VALIDO'.
 *
 * Concurrencia: el mismo archivo (mismo SHA-256) no puede procesarse dos veces a la vez dentro de esta instancia;
 * archivos distintos se procesan en paralelo, cada uno con su propio registro y sus propios lotes.
 */
public class IngestionManager {

    private static final System.Logger LOG = System.getLogger(IngestionManager.class.getName());

    private final FileParserFactory fabricaParsers;
    private final MappingProfileCatalog perfiles;
    private final IngestionLogRepository logs;
    private final QualityReportRepository reportes;
    private final RecordRepository siniestros;
    private final RecordRepository victimas;
    private final GeoBounds limites;
    private final int tamanoLote;
    private final int maxErrores;
    private final Set<String> enProceso = ConcurrentHashMap.newKeySet();

    public IngestionManager(FileParserFactory fabricaParsers, MappingProfileCatalog perfiles,
                            IngestionLogRepository logs, QualityReportRepository reportes,
                            RecordRepository siniestros, RecordRepository victimas,
                            GeoBounds limites, int tamanoLote, int maxErrores) {
        if (tamanoLote < 1 || maxErrores < 0) {
            throw new IllegalArgumentException("tamanoLote debe ser >= 1 y maxErrores >= 0");
        }
        this.fabricaParsers = Objects.requireNonNull(fabricaParsers);
        this.perfiles = Objects.requireNonNull(perfiles);
        this.logs = Objects.requireNonNull(logs);
        this.reportes = Objects.requireNonNull(reportes);
        this.siniestros = Objects.requireNonNull(siniestros);
        this.victimas = Objects.requireNonNull(victimas);
        this.limites = Objects.requireNonNull(limites);
        this.tamanoLote = tamanoLote;
        this.maxErrores = maxErrores;
    }

    public IngestionLog cargarArchivo(UploadedFile archivo, DataSource fuente, UserRef usuario) {
        Objects.requireNonNull(archivo, "archivo");
        Objects.requireNonNull(fuente, "fuente");
        Objects.requireNonNull(usuario, "usuario");

        String checksum;
        try {
            checksum = sha256(archivo);
        } catch (IOException e) {
            throw new IngestionException("No se pudo leer el archivo recibido.", e);
        }
        String nombre = archivo.name() == null ? "archivo" : archivo.name();
        if (nombre.length() > 255) {
            nombre = nombre.substring(0, 255);
        }

        // El registro se crea primero como FALLIDA: si todo se interrumpe, la carga queda trazada igual.
        IngestionLog log = logs.save(new IngestionLog(null, LocalDateTime.now(), fuente, LoadResult.FALLIDA,
                usuario.id(), usuario.nombre(), nombre, null, "Carga en proceso.", checksum, null));

        if (!enProceso.add(checksum)) {
            return cerrarFallida(log, "Este mismo archivo ya se está procesando en otra carga.", false);
        }
        try {
            Optional<IngestionLog> previa = logs.findCargaPreviaPorChecksum(checksum);
            if (previa.isPresent()) {
                return cerrarFallida(log, "Este archivo ya se cargó en la carga n.º " + previa.get().id()
                        + "; se rechazó para no duplicar registros.", false);
            }
            return procesar(archivo, fuente, log);
        } finally {
            enProceso.remove(checksum);
        }
    }

    public List<IngestionLog> historial() {
        return logs.findAllPorFechaDesc();
    }

    public Optional<QualityReport> reporteCalidad(long idCarga) {
        return reportes.findByIdCarga(idCarga);
    }

    // ------------------------------------------------------------------

    private IngestionLog procesar(UploadedFile archivo, DataSource fuente, IngestionLog log) {
        try {
            FileFormat formato = FileFormatDetector.detectar(archivo);
            FileParser parser = fabricaParsers.crear(formato);
            MappingProfile perfil = elegirPerfil(archivo, fuente, formato, parser);
            return ejecutar(archivo, parser, perfil, log.conPerfil(perfil.id()));
        } catch (IngestionException e) {
            return cerrarFallida(log, e.getMessage(), true);
        } catch (IOException | RuntimeException e) {
            // Sin mensaje ni datos de la excepción en el log de errores: puede contener contenido de filas.
            LOG.log(System.Logger.Level.ERROR, "Falló la carga {0}: {1}", log.id(), e.getClass().getName());
            LOG.log(System.Logger.Level.DEBUG, "Detalle de la falla en la carga " + log.id(), e);
            return cerrarFallida(log, "Ocurrió un error inesperado al procesar el archivo; no se guardó ningún registro.",
                    true);
        }
    }

    private MappingProfile elegirPerfil(UploadedFile archivo, DataSource fuente, FileFormat formato, FileParser parser)
            throws IOException {
        List<MappingProfile> candidatos = perfiles.perfilesDe(fuente).stream()
                .filter(p -> p.formatos().contains(formato)).toList();
        if (candidatos.isEmpty()) {
            throw new IngestionException("La fuente " + fuente + " no admite archivos " + formato + ".");
        }
        List<MappingProfile> habilitados = candidatos.stream().filter(MappingProfile::habilitado).toList();
        if (habilitados.isEmpty()) {
            throw new IngestionException("La fuente " + fuente + " todavía no se puede cargar: "
                    + candidatos.get(0).motivoDeshabilitado());
        }

        MappingProfile masCercano = null;
        List<String> faltantesDelMasCercano = null;
        for (MappingProfile candidato : habilitados) {
            List<String> encabezados = parser.leerEncabezados(archivo, candidato.opcionesDeLectura());
            List<String> faltantes = candidato.encabezadosFaltantes(encabezados);
            if (faltantes.isEmpty()) {
                return candidato;
            }
            if (masCercano == null || faltantes.size() < faltantesDelMasCercano.size()) {
                masCercano = candidato;
                faltantesDelMasCercano = faltantes;
            }
        }
        throw new IngestionException("El archivo no coincide con ningún perfil de columnas de la fuente " + fuente
                + ". Columnas que faltan para el perfil '" + masCercano.id() + "': "
                + String.join(", ", faltantesDelMasCercano) + ".");
    }

    private IngestionLog ejecutar(UploadedFile archivo, FileParser parser, MappingProfile perfil, IngestionLog log)
            throws IOException {
        DataValidator validador = new DataValidator(perfil, limites);
        RecordRepository destino = perfil.tipo() == RecordKind.SINISTER ? siniestros : victimas;
        long logId = log.id();
        Acumulador acc = new Acumulador(maxErrores);
        List<NormalizedRecord> lote = new ArrayList<>(tamanoLote);

        parser.parse(archivo, perfil.opcionesDeLectura(), fila -> {
            ValidationResult r = validador.evaluar(fila);
            if (r.omitido()) {
                acc.omitidos++;
                return;
            }
            switch (r.estado()) {
                case VALIDO -> acc.validos++;
                case INCOMPLETO -> acc.incompletos++;
                case CORRUPTO -> acc.corruptos++;
            }
            acc.agregarErrores(r.errores());
            if (r.estado() != QualityStatus.CORRUPTO) {
                lote.add(new NormalizedRecord(logId, fila.fila(), perfil.tipo(), r.estado(), r.campos()));
                if (lote.size() >= tamanoLote) {
                    destino.saveAll(List.copyOf(lote));
                    lote.clear();
                }
            }
        });
        if (!lote.isEmpty()) {
            destino.saveAll(List.copyOf(lote));
            lote.clear();
        }

        QualityCounts conteos = new QualityCounts(acc.validos, acc.incompletos, acc.corruptos, acc.omitidos);
        if (conteos.evaluados() == 0) {
            throw new IngestionException(acc.omitidos == 0
                    ? "El archivo no contiene registros."
                    : "Ninguna fila cumple el filtro del perfil '" + perfil.id() + "' (" + acc.omitidos + " omitidas).");
        }

        int guardados = conteos.validos() + conteos.incompletos();
        LoadResult resultado = guardados == 0 ? LoadResult.FALLIDA
                : (conteos.incompletos() == 0 && conteos.corruptos() == 0 ? LoadResult.EXITOSA : LoadResult.PARCIAL);

        reportes.save(new QualityReport(logId, conteos.validos(), conteos.incompletos(), conteos.corruptos(),
                conteos.omitidos(), acc.errores));
        return logs.save(log.conResultado(resultado, mensajeFinal(resultado, conteos), conteos));
    }

    private static String mensajeFinal(LoadResult resultado, QualityCounts c) {
        String omitidas = c.omitidos() > 0 ? " Se omitieron " + c.omitidos() + " filas fuera del filtro de la fuente." : "";
        return switch (resultado) {
            case EXITOSA -> "Carga exitosa: " + c.validos() + " registros válidos." + omitidas;
            case PARCIAL -> "Carga parcial: " + c.validos() + " válidos, " + c.incompletos() + " incompletos y "
                    + c.corruptos() + " corruptos. Se guardaron los válidos y los incompletos; los corruptos se descartaron."
                    + omitidas;
            case FALLIDA -> "Carga fallida: ningún registro cumplió las reglas de calidad (" + c.corruptos()
                    + " corruptos)." + omitidas;
        };
    }

    /** Deja constancia de la falla y, si hace falta, borra lo que alcanzó a insertar esta carga. */
    private IngestionLog cerrarFallida(IngestionLog log, String mensaje, boolean limpiar) {
        long id = log.id();
        if (limpiar) {
            try {
                siniestros.deleteByIngestionLogId(id);
                victimas.deleteByIngestionLogId(id);
            } catch (RuntimeException e) {
                LOG.log(System.Logger.Level.ERROR, "No se pudo limpiar la carga {0}: {1}", id, e.getClass().getName());
            }
        }
        IngestionLog cerrada = log.conResultado(LoadResult.FALLIDA, mensaje, QualityCounts.VACIO);
        try {
            reportes.save(new QualityReport(id, 0, 0, 0, 0, List.of(mensaje)));
            return logs.save(cerrada);
        } catch (RuntimeException e) {
            LOG.log(System.Logger.Level.ERROR, "No se pudo registrar el cierre de la carga {0}: {1}", id,
                    e.getClass().getName());
            return cerrada;
        }
    }

    private static String sha256(UploadedFile archivo) throws IOException {
        try (InputStream in = archivo.open()) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[1 << 16];
            int n;
            while ((n = in.read(buffer)) > 0) {
                md.update(buffer, 0, n);
            }
            return HexFormat.of().formatHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    private static final class Acumulador {
        int validos;
        int incompletos;
        int corruptos;
        int omitidos;
        final List<String> errores = new ArrayList<>();
        private final int max;

        Acumulador(int max) {
            this.max = max;
        }

        void agregarErrores(List<String> nuevos) {
            for (String e : nuevos) {
                if (errores.size() >= max) {
                    return;
                }
                errores.add(e);
            }
        }
    }
}
