package app.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Fila de la tabla sinister. Entidad de persistencia sin lógica (campos públicos a propósito): el dominio
 * trabaja con NormalizedRecord y solo esta capa conoce JPA. No confundir con model.Sinister, que es de otro bloque.
 */
@Entity
@Table(name = "sinister")
public class SinisterEntity {

    // allocationSize = INCREMENT BY de sinister_seq (V1): permite a Hibernate reservar 50 ids por consulta y agrupar los INSERT
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sinister_seq")
    @SequenceGenerator(name = "sinister_seq", sequenceName = "sinister_seq", allocationSize = 50)
    public Long id;

    @Column(name = "ingestion_log_id", nullable = false)
    public Long ingestionLogId;

    @Column(name = "calidad", nullable = false, length = 10)
    public String calidad;

    @Column(name = "fecha")
    public LocalDateTime fecha;

    @Column(name = "provincia", length = 20)
    public String provincia;

    @Column(name = "canton", length = 80)
    public String canton;

    @Column(name = "distrito", length = 80)
    public String distrito;

    @Column(name = "ruta", length = 40)
    public String ruta;

    @Column(name = "km")
    public Double km;

    @Column(name = "lat")
    public Double lat;

    @Column(name = "lon")
    public Double lon;

    @Column(name = "tipo_vehiculo", length = 30)
    public String tipoVehiculo;

    @Column(name = "severidad", length = 30)
    public String severidad;

    @Column(name = "clima", length = 30)
    public String clima;

    @Column(name = "calzada", length = 30)
    public String calzada;

    @Column(name = "tiempo_respuesta_min")
    public Double tiempoRespuestaMin;

    @Column(name = "anio")
    public Short anio;

    @Column(name = "mes")
    public Short mes;

    @Column(name = "dia_semana", length = 10)
    public String diaSemana;

    @Column(name = "hora")
    public Short hora;

    @Column(name = "franja", length = 12)
    public String franja;

    @Column(name = "tipo_accidente", length = 40)
    public String tipoAccidente;

    @Column(name = "tipo_ruta", length = 30)
    public String tipoRuta;

    @Column(name = "zona", length = 15)
    public String zona;
}
