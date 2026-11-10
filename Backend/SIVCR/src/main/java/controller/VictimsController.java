package controller;

import model.FilterCriteria;
import model.PerfilVictimas;
import model.managers.FilterManager;
import model.managers.HistoryManager;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Perfil de víctimas y riesgo. Solo recibe, delega en FilterManager y responde. Los roles se verifican aquí, en el
 * servidor (mismo supuesto que RecordsController: ADMIN y ANALISTA).
 */
@RestController
@RequestMapping("/api/victims")
@PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA')")
public class VictimsController {

    private final FilterManager filterManager;
    private final HistoryManager historyManager;
    private final CurrentUser usuarios;

    public VictimsController(FilterManager filterManager, HistoryManager historyManager,
                             CurrentUser usuarios) {
        this.filterManager = filterManager;
        this.historyManager = historyManager;
        this.usuarios = usuarios;
    }

    /**
     * Cifras agregadas de las personas VALIDO que calzan con los filtros del cuerpo (todos opcionales; el mismo
     * FilterCriteria que usan los siniestros). Los filtros que solo existen en siniestros se ignoran y se informan en
     * filtrosNoAplicados. La consulta con filtros queda en el historial del usuario (HU 23).
     */
    @PostMapping("/profile")
    public PerfilVictimas getPerfil(@RequestBody(required = false) FilterCriteria filtros) {
        FilterCriteria criterios = filtros == null ? FilterCriteria.vacio() : filtros;
        PerfilVictimas perfil = filterManager.getPerfilVictimas(criterios);
        historyManager.registrar(usuarios.get().id(), criterios);
        return perfil;
    }
}
