package model.ingestion;

import enums.QualityStatus;
import java.util.List;
import java.util.Map;

/**
 * Resultado de evaluar una fila.
 *
 * @param estado   VALIDO, INCOMPLETO o CORRUPTO (sin sentido si omitido)
 * @param omitido  true si un filtro del perfil la dejó fuera: no cuenta en ningún contador
 * @param campos   campo destino -> valor ya convertido (Short/Integer/Double/String/LocalDateTime)
 * @param errores  motivos por los que no es VALIDO, uno por incumplimiento, con número de fila y columna
 */
public record ValidationResult(QualityStatus estado, boolean omitido, Map<String, Object> campos, List<String> errores) {

    public static ValidationResult omitida() {
        return new ValidationResult(QualityStatus.VALIDO, true, Map.of(), List.of());
    }
}
