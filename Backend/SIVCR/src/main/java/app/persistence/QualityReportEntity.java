package app.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Fila de quality_report: una por carga (ingestion_log_id es UNIQUE). */
@Entity
@Table(name = "quality_report")
public class QualityReportEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "ingestion_log_id", nullable = false)
    public Long ingestionLogId;

    @Column(name = "validos", nullable = false)
    public int validos;

    @Column(name = "incompletos", nullable = false)
    public int incompletos;

    @Column(name = "corruptos", nullable = false)
    public int corruptos;

    @Column(name = "omitidos", nullable = false)
    public int omitidos;

    /** Primeros errores de la carga (fila y motivo); jsonb. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "errores", nullable = false, columnDefinition = "jsonb")
    public List<String> errores;
}
