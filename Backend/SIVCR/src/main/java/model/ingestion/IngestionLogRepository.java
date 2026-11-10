package model.ingestion;

import java.util.List;
import java.util.Optional;
import model.Repository;

public interface IngestionLogRepository extends Repository<IngestionLog> {

    Optional<IngestionLog> findById(long id);

    /** Carga anterior del mismo archivo (mismo SHA-256) que terminó EXITOSA o PARCIAL; evita duplicar registros. */
    Optional<IngestionLog> findCargaPreviaPorChecksum(String checksum);

    /** Historial completo, de la más reciente a la más antigua, con usuario y conteos de calidad. */
    List<IngestionLog> findAllPorFechaDesc();
}
