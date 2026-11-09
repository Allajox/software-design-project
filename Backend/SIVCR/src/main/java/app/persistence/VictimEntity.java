package app.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;

/** Fila de la tabla victim (ver SinisterEntity). Las personas de COSEVI se guardan sin sinisterId (migración V3). */
@Entity
@Table(name = "victim")
public class VictimEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "victim_seq")
    @SequenceGenerator(name = "victim_seq", sequenceName = "victim_seq", allocationSize = 50)
    public Long id;

    @Column(name = "sinister_id")
    public Long sinisterId;

    @Column(name = "ingestion_log_id")
    public Long ingestionLogId;

    @Column(name = "calidad", length = 10)
    public String calidad;

    @Column(name = "edad")
    public Integer edad;

    @Column(name = "genero", length = 12)
    public String genero;

    @Column(name = "condicion", length = 20)
    public String condicion;

    @Column(name = "anio")
    public Short anio;

    @Column(name = "mes")
    public Short mes;

    @Column(name = "dia_semana", length = 10)
    public String diaSemana;

    @Column(name = "provincia", length = 20)
    public String provincia;

    @Column(name = "canton", length = 80)
    public String canton;

    @Column(name = "distrito", length = 80)
    public String distrito;

    @Column(name = "rol", length = 40)
    public String rol;

    @Column(name = "tipo_lesion", length = 30)
    public String tipoLesion;

    @Column(name = "vehiculo", length = 40)
    public String vehiculo;

    @Column(name = "edad_quinquenal", length = 20)
    public String edadQuinquenal;
}
