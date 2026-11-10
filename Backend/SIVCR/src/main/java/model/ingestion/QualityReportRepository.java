package model.ingestion;

import java.util.Optional;
import model.Repository;

public interface QualityReportRepository extends Repository<QualityReport> {

    Optional<QualityReport> findByIdCarga(long idCarga);
}
