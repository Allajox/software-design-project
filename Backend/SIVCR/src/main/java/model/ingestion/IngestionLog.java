package model.ingestion;

import enums.DataSource;
import enums.LoadResult;
import java.time.LocalDateTime;

/**
 * Registro de una carga (HU 5): fecha, fuente, resultado y usuario, más datos de apoyo.
 * Nace como FALLIDA (así una carga que se interrumpe a la mitad también queda registrada) y se actualiza al terminar.
 *
 * @param resumen conteos de calidad; null si la carga falló antes de evaluar registros
 */
public record IngestionLog(Long id, LocalDateTime fecha, DataSource fuente, LoadResult resultado,
                           Long usuarioId, String usuario, String archivo, String perfil,
                           String mensaje, String checksum, QualityCounts resumen) {

    public IngestionLog conId(Long nuevoId) {
        return new IngestionLog(nuevoId, fecha, fuente, resultado, usuarioId, usuario, archivo, perfil,
                mensaje, checksum, resumen);
    }

    public IngestionLog conPerfil(String nuevoPerfil) {
        return new IngestionLog(id, fecha, fuente, resultado, usuarioId, usuario, archivo, nuevoPerfil,
                mensaje, checksum, resumen);
    }

    public IngestionLog conResultado(LoadResult nuevoResultado, String nuevoMensaje, QualityCounts nuevoResumen) {
        return new IngestionLog(id, fecha, fuente, nuevoResultado, usuarioId, usuario, archivo, perfil,
                nuevoMensaje, checksum, nuevoResumen);
    }
}
