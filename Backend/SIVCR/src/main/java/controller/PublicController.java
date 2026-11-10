package controller;

import model.dto.ResumenPublico;
import model.interfaces.IDashboardManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vista pública (HU 19): solo agregados nacionales de siniestros, sin personas y sin filtros del cliente, con la forma
 * que lee el frontend. Es la única parte del panel abierta a quien no ha iniciado sesión ("Ingresar sin credenciales"):
 * SecurityConfig la deja en permitAll, así que no lleva @PreAuthorize. Por eso nunca debe devolver datos de personas ni
 * aceptar filtros del cliente; lo demás del panel (/api/dashboard/**) sí exige rol.
 */
@RestController
@RequestMapping("/api/public")
public class PublicController {

    private final IDashboardManager panel;

    public PublicController(IDashboardManager panel) {
        this.panel = panel;
    }

    @GetMapping("/summary")
    public ResumenPublico resumen() {
        return panel.getPublicSummary();
    }
}
