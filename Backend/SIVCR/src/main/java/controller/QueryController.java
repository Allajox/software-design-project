package controller;

import java.util.List;
import model.FilterCriteria;
import model.QueryHistory;
import model.SavedFilter;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.managers.FilterManager;
import model.managers.HistoryManager;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultas guardadas (HU 22) e historial de consultas (HU 23) del usuario autenticado: cada usuario solo ve
 * y usa lo suyo. Los roles se verifican aquí, en el servidor (supuesto: ADMIN y ANALISTA).
 */
@RestController
@RequestMapping("/api/queries")
@PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA')")
public class QueryController {
    private final FilterManager filterManager;
    private final HistoryManager historyManager;
    private final CurrentUser usuarios;

    public QueryController(FilterManager filterManager, HistoryManager historyManager,
                           CurrentUser usuarios) {
        this.filterManager = filterManager;
        this.historyManager = historyManager;
        this.usuarios = usuarios;
    }

    public record GuardarFiltroRequest(String nombre, FilterCriteria criterios) {}

    /** HU 22: guarda el filtro con un nombre. 409 si el usuario ya tiene uno con ese nombre. */
    @PostMapping("/saved")
    @ResponseStatus(HttpStatus.CREATED)
    public SavedFilter guardarFiltro(@RequestBody GuardarFiltroRequest solicitud) {
        FilterCriteria criterios = solicitud.criterios() == null ? FilterCriteria.vacio() : solicitud.criterios();
        return filterManager.guardarFiltro(solicitud.nombre(), criterios, usuarios.get().id());
    }

    /** HU 22: filtros guardados del usuario, del más reciente al más antiguo. */
    @GetMapping("/saved")
    public List<SavedFilter> getFiltrosGuardados() {
        return filterManager.getFiltrosGuardados(usuarios.get().id());
    }

    /** HU 23: las últimas consultas del usuario, de la más reciente a la más antigua. */
    @GetMapping("/history")
    public List<QueryHistory> getHistorial() {
        return historyManager.getHistorial(usuarios.get().id());
    }

    /**
     * HU 23: devuelve los criterios de una consulta del historial para volver a ejecutarla (el cliente los
     * carga en la barra de filtros y los envía a POST /api/records/search).
     */
    @GetMapping("/history/{id}")
    public FilterCriteria reejecutar(@PathVariable("id") Long idConsulta) {
        return historyManager.buscar(usuarios.get().id(), idConsulta)
                .map(QueryHistory::criterios)
                .orElseThrow(() -> new SivcrException(Tipo.NO_ENCONTRADO,
                        "No existe la consulta " + idConsulta + " en tu historial"));
    }
}
