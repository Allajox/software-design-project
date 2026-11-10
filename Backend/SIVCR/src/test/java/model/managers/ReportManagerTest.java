package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import enums.ExportFormat;
import enums.Gender;
import enums.Province;
import enums.QualityStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import model.FilterCriteria;
import model.FiltroInvalidoException;
import model.Sinister;
import model.SinisterRepository;
import model.dto.DashboardCharts;
import model.dto.ExportFile;
import model.dto.HeatmapData;
import model.dto.KPIResult;
import model.dto.KPIValue;
import model.dto.Page;
import model.dto.ParetoPoint;
import model.dto.PublicSummary;
import model.export.ReportData;
import model.export.ReportWriter;
import model.interfaces.IStatsManager;
import org.junit.jupiter.api.Test;

/** ReportManager: busca, decide si hace falta el resumen de KPI y pone la fecha de Costa Rica (sin base de datos ni POI). */
class ReportManagerTest {

    private static class Siniestros implements SinisterRepository {
        FilterCriteria recibido;
        @Override public List<Sinister> buscar(FilterCriteria c) {
            recibido = c;
            return List.of(new Sinister(Province.LIMON, "Pococí", "Guápiles", "32", null, null, null, null, null, null,
                    null, null, QualityStatus.VALIDO, null, 2023, 4, null, null));
        }
        @Override public Page<Sinister> buscar(FilterCriteria c, int pagina, int tamano, List<Orden> orden) {
            throw new UnsupportedOperationException();
        }
    }

    private static class Estadisticas implements IStatsManager {
        int pedidosDeKpi = 0;
        @Override public KPIResult getKPIs(FilterCriteria f) {
            pedidosDeKpi++;
            KPIValue sin = new KPIValue(null, "%", "x");
            return new KPIResult(1, new KPIResult.Tsv(sin, 1, List.of(), List.of()), sin, sin, sin);
        }
        @Override public String describeScope(FilterCriteria f) { return "ámbito de prueba"; }
        @Override public DashboardCharts getCharts(FilterCriteria f) { throw new UnsupportedOperationException(); }
        @Override public HeatmapData getHeatmap(FilterCriteria f) { throw new UnsupportedOperationException(); }
        @Override public List<ParetoPoint> getPareto(FilterCriteria f) { throw new UnsupportedOperationException(); }
        @Override public PublicSummary getPublicSummary() { throw new UnsupportedOperationException(); }
    }

    /** Escritor de mentira: guarda lo que recibió y devuelve un archivo con la extensión de su formato. */
    private static class Escritor implements ReportWriter {
        private final ExportFormat formato;
        private final boolean usaKpis;
        ReportData recibido;

        Escritor(ExportFormat formato, boolean usaKpis) {
            this.formato = formato;
            this.usaKpis = usaKpis;
        }
        @Override public ExportFormat formato() { return formato; }
        @Override public boolean usaKpis() { return usaKpis; }
        @Override public ExportFile escribir(ReportData datos) {
            recibido = datos;
            return new ExportFile(new byte[0], "x/x", "archivo." + formato.name().toLowerCase());
        }
    }

    private final Siniestros siniestros = new Siniestros();
    private final Estadisticas estadisticas = new Estadisticas();
    private final Escritor csv = new Escritor(ExportFormat.CSV, false);
    private final Escritor excel = new Escritor(ExportFormat.EXCEL, true);
    // 2026-11-10T03:30Z es la noche del 9 de noviembre en Costa Rica (UTC-6)
    private final ReportManager manager = new ReportManager(
            new FilterManager(siniestros, null, null), estadisticas, List.of(csv, excel),
            Clock.fixed(Instant.parse("2026-11-10T03:30:00Z"), ZoneId.of("America/Costa_Rica")));

    @Test
    void elReporteLlevaElAmbitoLosRegistrosYLaHoraDeCostaRica() {
        ExportFile archivo = manager.export(FilterCriteria.vacio(), ExportFormat.CSV);
        assertEquals("archivo.csv", archivo.fileName());
        assertEquals("ámbito de prueba", csv.recibido.ambito());
        assertEquals(1, csv.recibido.registros().size());
        assertEquals(LocalDateTime.of(2026, 11, 9, 21, 30), csv.recibido.generado());
    }

    @Test
    void soloLosFormatosQueUsanKpiPidenElResumen() {
        manager.export(FilterCriteria.vacio(), ExportFormat.CSV);
        assertEquals(0, estadisticas.pedidosDeKpi);
        assertNull(csv.recibido.kpis());

        manager.export(FilterCriteria.vacio(), ExportFormat.EXCEL);
        assertEquals(1, estadisticas.pedidosDeKpi);
        assertNotNull(excel.recibido.kpis());
    }

    @Test
    void buscaConLosMismosFiltrosQueLaTabla() {
        FilterCriteria c = new FilterCriteria(Province.LIMON, null, null, null, 2023, null, null, null, null, null,
                null, null, null, null, null);
        manager.export(c, ExportFormat.CSV);
        assertEquals(c, siniestros.recibido);
    }

    @Test
    void edadYGeneroSeRechazanIgualQueEnLaTabla() {
        FilterCriteria conGenero = new FilterCriteria(null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, Gender.FEMENINO);
        assertThrows(FiltroInvalidoException.class, () -> manager.export(conGenero, ExportFormat.CSV));
    }

    @Test
    void unFiltroInvalidoOUnFormatoSinEscritorSeRechazan() {
        FilterCriteria anioRaro = new FilterCriteria(null, null, null, null, 1800, null, null, null, null, null,
                null, null, null, null, null);
        assertThrows(FiltroInvalidoException.class, () -> manager.export(anioRaro, ExportFormat.CSV));
        assertThrows(FiltroInvalidoException.class, () -> manager.export(FilterCriteria.vacio(), null));
        // PDF no está registrado en este manager de prueba
        assertThrows(FiltroInvalidoException.class, () -> manager.export(FilterCriteria.vacio(), ExportFormat.PDF));
    }
}
