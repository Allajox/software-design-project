package controller;

import model.dto.PublicSummary;
import model.managers.StatsManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Vista pública (HU 18): sin autenticación y solo con agregados. Debe estar en permitAll de la seguridad. */
@RestController
@RequestMapping("/api/public")
public class PublicController {

    private final StatsManager stats;

    public PublicController(StatsManager stats) {
        this.stats = stats;
    }

    @GetMapping("/summary")
    public PublicSummary resumen() {
        return stats.resumenPublico();
    }
}
