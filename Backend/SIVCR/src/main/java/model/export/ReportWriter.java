package model.export;

import enums.ExportFormat;
import model.dto.ExportFile;

/**
 * Escribe un reporte en un formato (una estrategia por formato). No depende de Spring: recibe los datos ya filtrados y
 * devuelve los bytes del archivo.
 */
public interface ReportWriter {

    /** El formato que sabe escribir. */
    ExportFormat formato();

    /** true si el archivo lleva el resumen de KPI además de los registros (Excel y PDF); el CSV es solo la tabla. */
    default boolean usaKpis() {
        return false;
    }

    ExportFile escribir(ReportData datos);
}
