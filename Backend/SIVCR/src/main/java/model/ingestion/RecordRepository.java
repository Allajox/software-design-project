package model.ingestion;

import model.Repository;

/** Destino de las filas validadas (una implementación por tabla: siniestros y víctimas). */
public interface RecordRepository extends Repository<NormalizedRecord> {

    /** Borra todo lo que insertó una carga; se usa para no dejar cargas a medias si algo falla. */
    void deleteByIngestionLogId(long ingestionLogId);
}
