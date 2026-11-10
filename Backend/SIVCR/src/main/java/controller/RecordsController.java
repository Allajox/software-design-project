package controller;

import model.FilterCriteria;
import model.Sinister;
import model.dto.Page;
import model.managers.FilterManager;
import model.managers.HistoryManager;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tabla de registros (HU 20). Solo recibe, delega en FilterManager y responde.
 * Los roles se verifican aquí, en el servidor (supuesto: ADMIN y ANALISTA; ajustar si el SAD dice otra cosa).
 */
@RestController
@RequestMapping("/api/records")
@PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA')")
public class RecordsController {

    private final FilterManager filterManager;
    private final HistoryManager historyManager;
    private final CurrentUser usuarios;

    public RecordsController(FilterManager filterManager, HistoryManager historyManager,
                             CurrentUser usuarios) {
        this.filterManager = filterManager;
        this.historyManager = historyManager;
        this.usuarios = usuarios;
    }

    /**
     * Una página de siniestros VALIDO que calzan con los filtros del cuerpo (todos opcionales).
     * page empieza en 0, size llega hasta 200 y sort es "campo" o "campo:desc". Pedir la página 0 con filtros
     * registra la consulta en el historial del usuario (HU 23).
     */
    @PostMapping("/search")
    public Page<Sinister> getRegistros(@RequestBody(required = false) FilterCriteria filtros,
                                       @RequestParam(name = "page", defaultValue = "0") int pagina,
                                       @RequestParam(name = "size", defaultValue = "50") int tamano,
                                       @RequestParam(name = "sort", required = false) String orden) {
        FilterCriteria criterios = filtros == null ? FilterCriteria.vacio() : filtros;
        Page<Sinister> resultado = filterManager.getRegistros(criterios, pagina, tamano, orden);
        if (pagina == 0) {
            historyManager.registrar(usuarios.get().id(), criterios);
        }
        return resultado;
    }

    // To-do
    /*
    public File exportar(FilterCriteria criteria, ExportFormat formato) {
        return;
    }
    */
}
