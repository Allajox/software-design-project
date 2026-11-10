package model.ingestion;

import java.util.List;
import java.util.Optional;
import model.Repository;

/** Puerto de las cargas (HU 5) y de su reporte de calidad (HU 3): el reporte pertenece a la carga. */
public interface IngestionLogRepository extends Repository<IngestionLog> {

    Optional<IngestionLog> findById(long id);

    /** Carga anterior del mismo archivo (mismo SHA-256) que terminó EXITOSA o PARCIAL; evita duplicar registros. */
    Optional<IngestionLog> findCargaPreviaPorChecksum(String checksum);

    /** Historial completo, de la más reciente a la más antigua, con usuario y conteos de calidad. */
    List<IngestionLog> findAllPorFechaDesc();

    /** Guarda el reporte de calidad de una carga; hay uno por carga, así que guardar de nuevo lo reemplaza. */
    QualityReport guardarReporte(QualityReport reporte);

    Optional<QualityReport> findReporte(long idCarga);
}
