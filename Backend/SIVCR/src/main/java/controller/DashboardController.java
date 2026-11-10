package controller;

import model.dto.DashboardCharts;
import model.dto.DashboardFilters;
import model.managers.ReportManager;
import model.managers.ReportManager.Formato;
import model.managers.ReportManager.Reporte;
import model.managers.StatsManager;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final StatsManager stats;
    private final ReportManager reportes;

    public DashboardController(StatsManager stats, ReportManager reportes) {
        this.stats = stats;
        this.reportes = reportes;
    }

    @GetMapping
    public DashboardCharts dashboard(DashboardFilters filtros) {
        return stats.dashboard(filtros);
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> exportar(DashboardFilters filtros,
                                           @RequestParam(defaultValue = "csv") String formato) {
        Reporte r = reportes.generar(filtros, Formato.de(formato));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + r.nombreArchivo() + "\"")
                .contentType(MediaType.parseMediaType(r.contentType()))
                .body(r.contenido());
    }
}
