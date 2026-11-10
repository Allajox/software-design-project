package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.ExportFormat;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.dto.DashboardFilters;
import model.dto.DashboardPanel;
import model.dto.DashboardPanel.ItemConteo;
import model.dto.DashboardPanel.ItemRuta;
import model.dto.DashboardPanel.ItemVehiculo;
import model.dto.DashboardPanel.Kpis;
import model.dto.DashboardPanel.MatrizDiaFranja;
import model.dto.DashboardPanel.PerfilDemografico;
import model.dto.OpcionesPanel;
import model.dto.ExportFile;
import model.dto.ResumenPublico;
import model.interfaces.IDashboardManager;
import org.junit.jupiter.api.Test;

/**
 * El reporte del dashboard en CSV (el único formato que corre en "mvn test" sin depender de Excel ni de OpenPDF: el
 * Excel y el PDF se comprueban en DashboardFlowIT contra el servidor real). Con un panel armado a mano, sin base de
 * datos ni Spring.
 */
class DashboardReportManagerTest {

    private DashboardFilters pedido;

    private final IDashboardManager panel = new IDashboardManager() {
        @Override public DashboardPanel getPanel(DashboardFilters filters) {
            pedido = filters;
            return new DashboardPanel(
                new Kpis(120, 1000, 12.0, 2.5, null, 90, 3, 20, 67, 18.256),
                List.of(new ItemConteo("San José", 70, 58.333), new ItemConteo("=SUMA(A1)", 50, 41.667)),
                List.of(new ItemVehiculo("Motocicleta", 60, 50.0, 1.5)),
                List.of(new ItemConteo("Fallecido", 0, 0)),
                List.of(new ItemRuta("Ruta 2", 30, 25.0, 25.0), new ItemRuta("Ruta 1", 20, 16.667, 41.667)),
                new MatrizDiaFranja(List.of("Lunes", "Martes"), List.of("Madrugada", "Mañana"),
                    List.of(List.of(1L, 2L), List.of(0L, 4L)), 4),
                new PerfilDemografico(List.of(">60", "18-25"), List.of(5L, 6L), List.of(7L, 8L)));
        }
        @Override public OpcionesPanel getOptions() {
            throw new UnsupportedOperationException();
        }
        @Override public ResumenPublico getPublicSummary() {
            throw new UnsupportedOperationException();
        }
    };

    // 2026-11-10 03:30 UTC es el 9 de noviembre en Costa Rica (UTC-6): el nombre del archivo usa la fecha del reloj
    private final Clock reloj = Clock.fixed(Instant.parse("2026-11-10T03:30:00Z"), ZoneId.of("America/Costa_Rica"));
    private final DashboardReportManager manager = new DashboardReportManager(panel, reloj);

    private String csv(DashboardFilters filtros) {
        ExportFile archivo = manager.export(filtros, ExportFormat.CSV);
        return new String(archivo.content(), StandardCharsets.UTF_8);
    }

    @Test
    void elCsvTraeLosFiltrosLosIndicadoresYCadaGraficoComoTabla() {
        DashboardFilters filtros = new DashboardFilters("Limón", null, null, null, List.of(2023, 2024), null, null,
            null, null, null, null, null, null, null);
        String texto = csv(filtros);
        assertTrue(texto.startsWith("﻿"), "con BOM para que Excel en español abra bien los acentos");
        List<String> titulos = List.of("Filtros aplicados", "Indicadores clave", "Siniestros por provincia",
            "Personas por tipo de vehículo", "Siniestros por gravedad", "Diagrama de Pareto: rutas con más siniestros",
            "Mapa de calor: día de la semana y franja horaria", "Personas por rango de edad y género");
        int desde = 0;
        for (String titulo : titulos) {
            int en = texto.indexOf(titulo, desde);
            assertTrue(en >= 0, "falta o está fuera de orden: " + titulo);
            desde = en;
        }
        assertTrue(texto.contains("Provincia;Limón"));
        assertTrue(texto.contains("Año;2023, 2024"));
        assertEquals(filtros, pedido, "el reporte pide el panel con los mismos filtros");
    }

    @Test
    void losNumerosVanConComaDecimalYElTprSinDatosDiceSinDatos() {
        String texto = csv(DashboardFilters.vacio());
        assertTrue(texto.contains("TSV - Tasa de siniestralidad vial (%);12,00"));
        assertTrue(texto.contains("ISS - Índice de severidad;2,50"));
        assertTrue(texto.contains("TPR - Tiempo promedio de respuesta (min);Sin datos"), "null no es 0");
        assertTrue(texto.contains("IC - Impacto por clima y calzada (%);18,26"));
        assertTrue(texto.contains("Siniestros (con filtros);120"));
        assertTrue(texto.contains("Siniestros (total registrado);1000"), "los enteros van sin separador de miles");
        assertTrue(texto.contains("Sin filtros;Todos los registros válidos"));
    }

    @Test
    void elMapaDeCalorYElParetoSalenComoTablasConSusColumnas() {
        String texto = csv(DashboardFilters.vacio());
        assertTrue(texto.contains("Día;Madrugada;Mañana\r\nLunes;1;2\r\nMartes;0;4"));
        assertTrue(texto.contains("Ruta;Siniestros;%;% acumulado\r\nRuta 2;30;25,00;25,00\r\nRuta 1;20;16,67;41,67"));
        assertTrue(texto.contains("Rango de edad;Masculino;Femenino\r\n>60;5;7\r\n18-25;6;8"));
    }

    @Test
    void unTextoQueEmpiezaComoFormulaNuncaLlegaAExcelComoFormula() {
        String texto = csv(DashboardFilters.vacio());
        assertTrue(texto.contains("'=SUMA(A1);50"), "se antepone un apóstrofo");
        assertFalse(texto.contains("\r\n=SUMA"));
    }

    @Test
    void elArchivoSeNombraConLaFechaDelRelojYTraeSuTipo() {
        ExportFile archivo = manager.export(DashboardFilters.vacio(), ExportFormat.CSV);
        // 3:30 UTC del 10 es todavía el 9 en Costa Rica
        assertEquals("sivcr-dashboard-2026-11-09.csv", archivo.fileName());
        assertEquals("text/csv;charset=UTF-8", archivo.mimeType());
    }

    @Test
    void sinFormatoSeRechazaComoSolicitudInvalida() {
        SivcrException e = assertThrows(SivcrException.class, () -> manager.export(DashboardFilters.vacio(), null));
        assertEquals(Tipo.SOLICITUD_INVALIDA, e.tipo());
        assertTrue(e.getMessage().contains("CSV, EXCEL o PDF"));
    }
}
