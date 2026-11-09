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

/** Inserta víctimas/personas por lotes (ver SinisterRecordRepository). */
@Repository("victimRecordRepository")
public class VictimRecordRepository implements RecordRepository {

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
        return em.createQuery("select count(v) from VictimEntity v", Long.class).getSingleResult();
    }

    @Override
    @Transactional
    public void deleteByIngestionLogId(long ingestionLogId) {
        em.createQuery("delete from VictimEntity v where v.ingestionLogId = :id")
                .setParameter("id", ingestionLogId)
                .executeUpdate();
    }

    private static VictimEntity aEntidad(NormalizedRecord r) {
        Map<String, Object> c = r.campos();
        VictimEntity e = new VictimEntity();
        e.sinisterId = null; // el archivo de personas de COSEVI no trae identificador del siniestro
        e.ingestionLogId = r.ingestionLogId();
        e.calidad = r.calidad().name();
        e.edad = Campos.entero(c, "edad");
        e.genero = Campos.texto(c, "genero");
        e.condicion = Campos.texto(c, "condicion");
        e.anio = Campos.corto(c, "anio");
        e.mes = Campos.corto(c, "mes");
        e.diaSemana = Campos.texto(c, "dia_semana");
        e.provincia = Campos.texto(c, "provincia");
        e.canton = Campos.texto(c, "canton");
        e.distrito = Campos.texto(c, "distrito");
        e.rol = Campos.texto(c, "rol");
        e.tipoLesion = Campos.texto(c, "tipo_lesion");
        e.vehiculo = Campos.texto(c, "vehiculo");
        e.edadQuinquenal = Campos.texto(c, "edad_quinquenal");
        return e;
    }
}
