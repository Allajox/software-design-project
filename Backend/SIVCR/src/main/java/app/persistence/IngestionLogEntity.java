package app.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/** Fila de ingestion_log (V1, V2, V3). */
@Entity
@Table(name = "ingestion_log")
public class IngestionLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "fecha", nullable = false)
    public LocalDateTime fecha;

    @Column(name = "fuente", nullable = false, length = 10)
    public String fuente;

    @Column(name = "nombre_archivo", length = 255)
    public String nombreArchivo;

    @Column(name = "resultado", nullable = false, length = 10)
    public String resultado;

    @Column(name = "mensaje", columnDefinition = "text")
    public String mensaje;

    @Column(name = "usuario_id", nullable = false)
    public Long usuarioId;

    @Column(name = "checksum", length = 64)
    public String checksum;

    @Column(name = "perfil", length = 60)
    public String perfil;
}
