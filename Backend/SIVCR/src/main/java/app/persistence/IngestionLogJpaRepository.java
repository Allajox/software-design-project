package app.persistence;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IngestionLogJpaRepository extends JpaRepository<IngestionLogEntity, Long> {

    Optional<IngestionLogEntity> findFirstByChecksumAndResultadoInOrderByFechaDesc(String checksum,
                                                                                  Collection<String> resultados);

    List<IngestionLogEntity> findAllByOrderByFechaDescIdDesc();
}
