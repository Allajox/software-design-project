package app.persistence;

import enums.DataSource;
import enums.LoadResult;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import model.ingestion.IngestionLog;
import model.ingestion.IngestionLogRepository;
import model.ingestion.QualityCounts;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Implementación JPA del puerto IngestionLogRepository. */
@Repository
public class JpaIngestionLogRepository implements IngestionLogRepository {

    private static final List<String> CARGAS_QUE_BLOQUEAN_DUPLICADOS = List.of(LoadResult.EXITOSA.name(),
            LoadResult.PARCIAL.name());

    private final IngestionLogJpaRepository logs;
    private final QualityReportJpaRepository reportes;
    private final AppUserViewRepository usuarios;

    public JpaIngestionLogRepository(IngestionLogJpaRepository logs, QualityReportJpaRepository reportes,
                                     AppUserViewRepository usuarios) {
        this.logs = logs;
        this.reportes = reportes;
        this.usuarios = usuarios;
    }

    @Override
    @Transactional
    public IngestionLog save(IngestionLog log) {
        IngestionLogEntity entidad = log.id() == null
                ? new IngestionLogEntity()
                : logs.findById(log.id()).orElseThrow(
                        () -> new IllegalStateException("No existe la carga " + log.id()));
        entidad.fecha = log.fecha();
        entidad.fuente = log.fuente().name();
        entidad.nombreArchivo = log.archivo();
        entidad.resultado = log.resultado().name();
        entidad.mensaje = log.mensaje();
        entidad.usuarioId = log.usuarioId();
        entidad.checksum = log.checksum();
        entidad.perfil = log.perfil();
        IngestionLogEntity guardada = logs.save(entidad);
        return log.conId(guardada.id);
    }

    @Override
    @Transactional
    public List<IngestionLog> saveAll(Collection<IngestionLog> entidades) {
        List<IngestionLog> guardadas = new ArrayList<>();
        for (IngestionLog l : entidades) {
            guardadas.add(save(l));
        }
        return guardadas;
    }

    @Override
    public long count() {
        return logs.count();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<IngestionLog> findById(long id) {
        return logs.findById(id).map(e -> aDominio(e, nombreDe(e.usuarioId), resumenDe(e.id)));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<IngestionLog> findCargaPreviaPorChecksum(String checksum) {
        return logs.findFirstByChecksumAndResultadoInOrderByFechaDesc(checksum, CARGAS_QUE_BLOQUEAN_DUPLICADOS)
                .map(e -> aDominio(e, nombreDe(e.usuarioId), resumenDe(e.id)));
    }

    @Override
    @Transactional(readOnly = true)
    public List<IngestionLog> findAllPorFechaDesc() {
        List<IngestionLogEntity> entidades = logs.findAllByOrderByFechaDescIdDesc();

        Set<Long> idsUsuarios = new HashSet<>();
        Set<Long> idsCargas = new HashSet<>();
        for (IngestionLogEntity e : entidades) {
            idsUsuarios.add(e.usuarioId);
            idsCargas.add(e.id);
        }
        Map<Long, String> nombres = new HashMap<>();
        if (!idsUsuarios.isEmpty()) {
            usuarios.findAllById(idsUsuarios).forEach(u -> nombres.put(u.id, u.name));
        }
        Map<Long, QualityCounts> resumenes = new HashMap<>();
        if (!idsCargas.isEmpty()) {
            reportes.findByIngestionLogIdIn(idsCargas).forEach(r -> resumenes.put(r.ingestionLogId, aConteos(r)));
        }

        List<IngestionLog> resultado = new ArrayList<>(entidades.size());
        for (IngestionLogEntity e : entidades) {
            resultado.add(aDominio(e, nombres.get(e.usuarioId), resumenes.get(e.id)));
        }
        return resultado;
    }

    private String nombreDe(Long usuarioId) {
        return usuarios.findById(usuarioId).map(u -> u.name).orElse(null);
    }

    private QualityCounts resumenDe(Long idCarga) {
        return reportes.findByIngestionLogId(idCarga).map(JpaIngestionLogRepository::aConteos).orElse(null);
    }

    private static QualityCounts aConteos(QualityReportEntity r) {
        return new QualityCounts(r.validos, r.incompletos, r.corruptos, r.omitidos);
    }

    private static IngestionLog aDominio(IngestionLogEntity e, String nombreUsuario, QualityCounts resumen) {
        return new IngestionLog(e.id, e.fecha, DataSource.valueOf(e.fuente), LoadResult.valueOf(e.resultado),
                e.usuarioId, nombreUsuario, e.nombreArchivo, e.perfil, e.mensaje, e.checksum, resumen);
    }
}
