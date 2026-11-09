package app.persistence;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QualityReportJpaRepository extends JpaRepository<QualityReportEntity, Long> {

    Optional<QualityReportEntity> findByIngestionLogId(Long ingestionLogId);

    List<QualityReportEntity> findByIngestionLogIdIn(Collection<Long> ingestionLogIds);
}
