package controller;

import enums.DataSource;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.ingestion.IngestionException;
import model.ingestion.IngestionLog;
import model.ingestion.IngestionManager;
import model.ingestion.QualityReport;
import model.ingestion.UploadedFile;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Ingesta y calidad de datos (HU 1 a 5). Solo recibe, delega en IngestionManager y responde.
 * Solo el rol ADMIN puede usarlo; la verificación se hace aquí, en el servidor.
 *
 * El procesamiento es síncrono: la respuesta llega cuando termina la carga (COSEVI: ~93 000 filas) e incluye
 * el resultado (EXITOSA, PARCIAL o FALLIDA) y los conteos. Una carga FALLIDA por contenido del archivo
 * (formato, columnas, duplicado) también responde 200 con el motivo en "mensaje"; los errores de uso
 * (sin archivo, fuente inválida) responden 400.
 */
@RestController
@RequestMapping("/api/ingestion")
@PreAuthorize("hasRole('ADMIN')")
public class IngestionController {

    private final IngestionManager manager;
    private final CurrentUser usuarios;

    public IngestionController(IngestionManager manager, CurrentUser usuarios) {
        this.manager = manager;
        this.usuarios = usuarios;
    }

    /** HU 1, 2, 3, 4: la fuente se elige antes de cargar y determina el mapeo de columnas. */
    @PostMapping(path = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public IngestionLog subirArchivo(@RequestParam("file") MultipartFile file,
                                     @RequestParam("fuente") DataSource fuente) {
        if (file.isEmpty()) {
            throw new IngestionException("No se recibió ningún archivo o está vacío.");
        }
        return manager.cargarArchivo(comoArchivo(file), fuente, usuarios.get());
    }

    /** HU 5: historial de cargas, de la más reciente a la más antigua. */
    @GetMapping("/history")
    public List<IngestionLog> getHistorial() {
        return manager.historial();
    }

    /** HU 3: reporte de calidad de una carga. */
    @GetMapping("/{idCarga}/quality-report")
    public QualityReport getReporteCalidad(@PathVariable("idCarga") Long idCarga) {
        return manager.reporteCalidad(idCarga).orElseThrow(
                () -> new SivcrException(Tipo.NO_ENCONTRADO, "No existe un reporte para la carga " + idCarga));
    }

    /** Presenta el MultipartFile de Spring como UploadedFile del dominio (sin la ruta que haya enviado el cliente). */
    private static UploadedFile comoArchivo(MultipartFile archivo) {
        String original = archivo.getOriginalFilename();
        String nombre = original == null || original.isBlank() ? "archivo"
                : original.substring(Math.max(original.lastIndexOf('/'), original.lastIndexOf('\\')) + 1);
        return new UploadedFile() {
            @Override
            public String name() {
                return nombre;
            }

            @Override
            public InputStream open() throws IOException {
                return archivo.getInputStream();
            }
        };
    }
}
