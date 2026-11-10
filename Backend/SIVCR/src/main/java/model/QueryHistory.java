package model;

import java.time.LocalDateTime;

/** Una consulta que el usuario ejecutó (HU 23): texto legible y los criterios completos para re-ejecutarla. */
public record QueryHistory(Long id, LocalDateTime fecha, String resumen, FilterCriteria criterios) {
}
