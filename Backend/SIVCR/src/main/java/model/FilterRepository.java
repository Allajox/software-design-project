package model;

import java.util.List;
import java.util.Optional;

/** Puerto de los filtros guardados (HU 22) y del historial de consultas (HU 23). La implementación vive en app.persistence. */
public interface FilterRepository {

    /** Guarda el filtro del usuario; lanza SivcrException CONFLICTO si ya tiene uno con ese nombre. */
    SavedFilter guardar(long usuarioId, String nombre, FilterCriteria criterio);

    /** Filtros del usuario, del más reciente al más antiguo. */
    List<SavedFilter> listar(long usuarioId);

    void registrar(long usuarioId, String resumen, FilterCriteria criterio);

    /** Las últimas consultas del usuario, de la más reciente a la más antigua. */
    List<QueryHistory> recientes(long usuarioId, int limite);

    /** Una consulta del historial; solo si pertenece al usuario. */
    Optional<QueryHistory> buscar(long usuarioId, long id);
}
