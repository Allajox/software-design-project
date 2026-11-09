package app.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import model.ingestion.NormalizedRecord;
import model.ingestion.RecordRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inserta siniestros por lotes. Cada llamada a saveAll es una transacción: el manager la invoca una vez por lote
 * (tamano-lote filas) y aquí se hace flush + clear para que el contexto de persistencia no crezca con el archivo.
 */
@Repository("sinisterRecordRepository")
public class SinisterRecordRepository implements RecordRepository {

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional
    public NormalizedRecord save(NormalizedRecord registro) {
        saveAll(List.of(registro));
        return registro;
    }

    @Override
    @Transactional
    public List<NormalizedRecord> saveAll(Collection<NormalizedRecord> registros) {
        List<NormalizedRecord> lista = List.copyOf(registros);
        for (NormalizedRecord r : lista) {
            em.persist(aEntidad(r));
        }
        em.flush();
        em.clear();
        return lista;
    }

    @Override
    public long count() {
        return em.createQuery("select count(s) from SinisterEntity s", Long.class).getSingleResult();
    }

    @Override
    @Transactional
    public void deleteByIngestionLogId(long ingestionLogId) {
        em.createQuery("delete from SinisterEntity s where s.ingestionLogId = :id")
                .setParameter("id", ingestionLogId)
                .executeUpdate();
    }

    private static SinisterEntity aEntidad(NormalizedRecord r) {
        Map<String, Object> c = r.campos();
        SinisterEntity e = new SinisterEntity();
        e.ingestionLogId = r.ingestionLogId();
        e.calidad = r.calidad().name();
        e.fecha = Campos.fecha(c, "fecha");
        e.anio = Campos.corto(c, "anio");
        e.mes = Campos.corto(c, "mes");
        e.diaSemana = Campos.texto(c, "dia_semana");
        e.hora = Campos.corto(c, "hora");
        e.franja = Campos.texto(c, "franja");
        e.provincia = Campos.texto(c, "provincia");
        e.canton = Campos.texto(c, "canton");
        e.distrito = Campos.texto(c, "distrito");
        e.ruta = Campos.texto(c, "ruta");
        e.km = Campos.decimal(c, "km");
        e.lat = Campos.decimal(c, "lat");
        e.lon = Campos.decimal(c, "lon");
        e.tipoVehiculo = Campos.texto(c, "tipo_vehiculo");
        e.severidad = Campos.texto(c, "severidad");
        e.clima = Campos.texto(c, "clima");
        e.calzada = Campos.texto(c, "calzada");
        e.tiempoRespuestaMin = Campos.decimal(c, "tiempo_respuesta_min");
        e.tipoAccidente = Campos.texto(c, "tipo_accidente");
        e.tipoRuta = Campos.texto(c, "tipo_ruta");
        e.zona = Campos.texto(c, "zona");
        return e;
    }
}
