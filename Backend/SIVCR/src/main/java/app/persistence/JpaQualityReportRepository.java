package app.persistence;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import model.ingestion.QualityReport;
import model.ingestion.QualityReportRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Implementación JPA del puerto QualityReportRepository. Un reporte por carga: guardar de nuevo lo actualiza. */
@Repository
public class JpaQualityReportRepository implements QualityReportRepository {

    private final QualityReportJpaRepository reportes;

    public JpaQualityReportRepository(QualityReportJpaRepository reportes) {
        this.reportes = reportes;
    }

    @Override
    @Transactional
    public QualityReport save(QualityReport reporte) {
        QualityReportEntity entidad = reportes.findByIngestionLogId(reporte.idCarga())
                .orElseGet(QualityReportEntity::new);
        entidad.ingestionLogId = reporte.idCarga();
        entidad.validos = reporte.validos();
        entidad.incompletos = reporte.incompletos();
        entidad.corruptos = reporte.corruptos();
        entidad.omitidos = reporte.omitidos();
        entidad.errores = new ArrayList<>(reporte.errores());
        reportes.save(entidad);
        return reporte;
    }

    @Override
    @Transactional
    public List<QualityReport> saveAll(Collection<QualityReport> entidades) {
        List<QualityReport> guardados = new ArrayList<>();
        for (QualityReport r : entidades) {
            guardados.add(save(r));
        }
        return guardados;
    }

    @Override
    public long count() {
        return reportes.count();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<QualityReport> findByIdCarga(long idCarga) {
        return reportes.findByIngestionLogId(idCarga).map(e -> new QualityReport(e.ingestionLogId, e.validos,
                e.incompletos, e.corruptos, e.omitidos, e.errores));
    }
}
