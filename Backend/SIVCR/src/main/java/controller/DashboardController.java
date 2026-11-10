package controller;

import model.FilterCriteria;
import model.dto.DashboardCharts;
import model.dto.DashboardFilters;
import model.dto.DashboardPanel;
import model.dto.ExportFile;
import model.dto.KPIResult;
import model.dto.OpcionesPanel;
import model.dto.PublicSummary;
import model.interfaces.IDashboardManager;
import model.interfaces.IStatsManager;
import model.managers.DashboardReportManager;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Dashboard: tarjetas de KPI y gráficos (HU 9, 11 a 19). Solo recibe, delega en los managers y responde. Los roles se
 * verifican aquí, en el servidor: ADMIN y ANALISTA ven KPI y gráficos con filtros; el resumen público lo ve además el
 * CONSULTOR porque solo trae agregados nacionales de siniestros, sin personas.
 *
 * Hay dos formas de pedir lo mismo, con las mismas fórmulas: POST /kpis y /charts (StatsManager: filtros del SAD, un
 * valor por filtro) y GET / y /export (DashboardManager: el panel con la forma que lee el frontend, con varios valores
 * por filtro: ?anios=2024&anios=2025).
 *
 * Las consultas del dashboard no se guardan en el historial: cada cambio de filtro dispara varias y llenarían la lista
 * (la tabla de registros sí las guarda, HU 23).
 */
@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA')")
public class DashboardController {

    private final IStatsManager estadisticas;
    private final IDashboardManager panel;
    private final DashboardReportManager informes;

    public DashboardController(IStatsManager estadisticas, IDashboardManager panel, DashboardReportManager informes) {
        this.estadisticas = estadisticas;
        this.panel = panel;
        this.informes = informes;
    }

    /**
     * El panel completo (KPI y gráficos) con la forma que lee el frontend. Los filtros llegan como parámetros de la URL;
     * las listas pueden repetirse (?anios=2024&anios=2025) y texto o lista vacíos significan "sin restricción".
     */
    @GetMapping
    public DashboardPanel getPanel(DashboardFilters filtros) {
        return panel.getPanel(filtros);
    }

    /**
     * Los valores que existen en los datos para llenar las listas de filtros: cantones por provincia, distritos por
     * cantón, rutas nacionales, años y tipos de vehículo. No depende de ningún filtro.
     */
    @GetMapping("/opciones")
    public OpcionesPanel getOpciones() {
        return panel.getOptions();
    }

    /**
     * Descarga el reporte del dashboard (filtros aplicados, KPI y cada gráfico como tabla) en CSV, EXCEL (o xlsx) o PDF
     * (parámetro format; formato también se acepta). Con los mismos filtros que GET /api/dashboard.
     */
    @GetMapping("/export")
    public ResponseEntity<byte[]> exportarPanel(DashboardFilters filtros,
                                                @RequestParam(name = "format", required = false) String format,
                                                @RequestParam(name = "formato", required = false) String formato) {
        String pedido = format != null ? format : (formato != null ? formato : "csv");
        ExportFile archivo = informes.export(filtros, RecordsController.formato(pedido));
        return ResponseEntity.ok()
                .header("Content-Type", archivo.mimeType())
                .header("Content-Disposition", "attachment; filename=\"" + archivo.fileName() + "\"")
                .body(archivo.content());
    }

    /** TSV, ISS, TPR y condiciones adversas con los filtros del cuerpo (todos opcionales). */
    @PostMapping("/kpis")
    public KPIResult getKpis(@RequestBody(required = false) FilterCriteria filtros) {
        return estadisticas.getKPIs(criterios(filtros));
    }

    /**
     * Mapa de calor, Pareto de rutas, víctimas por género y edad, y fatalidad por vehículo con los mismos filtros.
     * filtrosNoAplicados informa los filtros que algún gráfico no puede aplicar.
     */
    @PostMapping("/charts")
    public DashboardCharts getCharts(@RequestBody(required = false) FilterCriteria filtros) {
        return estadisticas.getCharts(criterios(filtros));
    }

    /** Agregados nacionales sin filtros del cliente ni datos de personas (HU 19). */
    @GetMapping("/public-summary")
    @PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA', 'CONSULTOR')")
    public PublicSummary getResumenPublico() {
        return estadisticas.getPublicSummary();
    }

    private static FilterCriteria criterios(FilterCriteria filtros) {
        return filtros == null ? FilterCriteria.vacio() : filtros;
    }
}
