package controller;

import enums.ExportFormat;
import java.util.Locale;
import model.FilterCriteria;
import model.Sinister;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.dto.ExportFile;
import model.dto.Page;
import model.interfaces.IReportManager;
import model.managers.FilterManager;
import model.managers.HistoryManager;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tabla de registros (HU 20) y su exportación (HU 21). Solo recibe, delega en FilterManager y ReportManager y responde.
 * Los roles se verifican aquí, en el servidor (supuesto: ADMIN y ANALISTA; ajustar si el SAD dice otra cosa).
 */
@RestController
@RequestMapping("/api/records")
@PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA')")
public class RecordsController {

    private final FilterManager filterManager;
    private final HistoryManager historyManager;
    private final IReportManager informes;
    private final CurrentUser usuarios;

    public RecordsController(FilterManager filterManager, HistoryManager historyManager,
                             IReportManager informes, CurrentUser usuarios) {
        this.filterManager = filterManager;
        this.historyManager = historyManager;
        this.informes = informes;
        this.usuarios = usuarios;
    }

    /**
     * Una página de siniestros VALIDO que calzan con los filtros del cuerpo (todos opcionales).
     * page empieza en 0, size llega hasta 200 y sort son campos "campo" o "campo:desc". Pedir la página 0 con filtros
     * registra la consulta en el historial del usuario (HU 23). El orden admite varios campos separados por coma, de
     * hasta 4 y sin repetir: sort=anio:desc,mes,provincia.
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

    /**
     * Descarga los siniestros VALIDO que calzan con los filtros del cuerpo (todos opcionales) en el formato pedido:
     * format=CSV, EXCEL o PDF (también xlsx). Con los mismos filtros que la tabla; edad y género se rechazan igual.
     * Excel y PDF llevan además el ámbito y los KPI; el PDF se limita a los primeros 5 000 registros.
     */
    @PostMapping("/export")
    public ResponseEntity<byte[]> exportar(@RequestBody(required = false) FilterCriteria filtros,
                                           @RequestParam(name = "format") String formato) {
        FilterCriteria criterios = filtros == null ? FilterCriteria.vacio() : filtros;
        ExportFile archivo = informes.export(criterios, formato(formato));
        return ResponseEntity.ok()
                .header("Content-Type", archivo.mimeType())
                .header("Content-Disposition", "attachment; filename=\"" + archivo.fileName() + "\"")
                .body(archivo.content());
    }

    /** Formato de exportación pedido: CSV, EXCEL (o xlsx) o PDF. También lo usa DashboardController. */
    static ExportFormat formato(String texto) {
        String normalizado = texto == null ? "" : texto.trim().toUpperCase(Locale.ROOT);
        if (normalizado.equals("XLSX")) {
            normalizado = ExportFormat.EXCEL.name();
        }
        try {
            return ExportFormat.valueOf(normalizado);
        } catch (IllegalArgumentException e) {
            throw new SivcrException(Tipo.SOLICITUD_INVALIDA, "Formato de exportación no válido. Use CSV, EXCEL o PDF.");
        }
    }
}
