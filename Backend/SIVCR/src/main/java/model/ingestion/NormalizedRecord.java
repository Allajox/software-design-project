package model.ingestion;

import enums.QualityStatus;
import java.util.Map;
import model.ingestion.profile.RecordKind;

/**
 * Fila validada y normalizada, lista para persistirse. Los CORRUPTO nunca llegan aquí:
 * solo se cuentan y se reportan.
 */
public record NormalizedRecord(long ingestionLogId, int fila, RecordKind tipo, QualityStatus calidad,
                               Map<String, Object> campos) {
}
