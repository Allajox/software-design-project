// Interface del ReportManager
package model.interfaces;

import enums.ExportFormat;
import model.FilterCriteria;
import model.dto.ExportFile;


// Encargado de generar los distintos archivos de exportacion (Excel, PDF, CSV, etc.) con los datos filtrados.
public interface IReportManager {

    //Genera el archivo en el formato pedido, respetando los filtros recibidos.
    ExportFile export(FilterCriteria filters, ExportFormat format);
}