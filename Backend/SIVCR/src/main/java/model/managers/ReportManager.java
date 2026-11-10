package model.managers;

import enums.ExportFormat;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import model.FilterCriteria;
import model.FiltroInvalidoException;
import model.Sinister;
import model.dto.ExportFile;
import model.dto.KPIResult;
import model.export.ReportData;
import model.export.ReportWriter;
import model.interfaces.IReportManager;
import model.interfaces.IStatsManager;

/**
 * Exportación de los siniestros filtrados a CSV, Excel y PDF (HU 21). Busca los registros con las mismas reglas que la
 * tabla (FilterManager: solo VALIDO, mismos filtros, edad y género rechazados), arma el resumen de KPI cuando el formato
 * lo usa y deja que el escritor del formato produzca el archivo. No depende de Spring.
 */
public class ReportManager implements IReportManager {

    private final FilterManager filtros;
    private final IStatsManager estadisticas;
    private final Map<ExportFormat, ReportWriter> escritores = new EnumMap<>(ExportFormat.class);
    private final Clock reloj;

    public ReportManager(FilterManager filtros, IStatsManager estadisticas, List<ReportWriter> escritores,
                         Clock reloj) {
        this.filtros = filtros;
        this.estadisticas = estadisticas;
        this.reloj = reloj;
        for (ReportWriter escritor : escritores) {
            this.escritores.put(escritor.formato(), escritor);
        }
    }

    @Override
    public ExportFile export(FilterCriteria filters, ExportFormat format) {
        ReportWriter escritor = format == null ? null : escritores.get(format);
        if (escritor == null) {
            throw new FiltroInvalidoException("Formato de exportación no disponible: " + format + ".");
        }
        List<Sinister> registros = filtros.aplicar(filters); // valida los filtros
        KPIResult kpis = escritor.usaKpis() ? estadisticas.getKPIs(filters) : null;
        return escritor.escribir(new ReportData(estadisticas.describeScope(filters), LocalDateTime.now(reloj), kpis,
            registros));
    }
}
