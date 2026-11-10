package app.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import model.FilterCriteria;
import model.SavedFilter;
import model.User;
import org.springframework.transaction.annotation.Transactional;

@org.springframework.stereotype.Repository("filterRepository")
public class FilterRecordRepository implements FilterRepository {

    @PersistenceContext
    private EntityManager em;

    private final ObjectMapper mapper;

    public FilterRecordRepository(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public SavedFilter save(SavedFilter filtro) {
        String json;
        try {
            json = mapper.writeValueAsString(filtro.getCriterio());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo convertir el filtro a JSON", e);
        }

        Number id = (Number) em.createNativeQuery("""
                INSERT INTO saved_filter (usuario_id, nombre, criteria)
                VALUES (:usuarioId, :nombre, CAST(:criteria AS jsonb))
                RETURNING id
                """)
            .setParameter("usuarioId", filtro.getUsuario().getId())
            .setParameter("nombre", filtro.getNombre())
            .setParameter("criteria", json)
            .getSingleResult();

        filtro.setId(id.longValue());
        return filtro;
    }

    @Override
    @Transactional
    public List<SavedFilter> saveAll(Collection<SavedFilter> filtros) {
        List<SavedFilter> guardados = new ArrayList<>();
        for (SavedFilter f : filtros) {
            guardados.add(save(f));
        }
        return guardados;
    }

    @Override
    public long count() {
        return ((Number) em.createNativeQuery("SELECT COUNT(*) FROM saved_filter")
                .getSingleResult()).longValue();
    }
    
    @Override
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<SavedFilter> findByUsuario(User usuario) {
        List<Object[]> filas = em.createNativeQuery("""
                SELECT id, nombre, CAST(criteria AS text)
                FROM saved_filter
                WHERE usuario_id = :uid
                ORDER BY creado_en DESC, id DESC
                """)
            .setParameter("uid", usuario.getId())
            .getResultList();

        List<SavedFilter> resultado = new ArrayList<>();
        for (Object[] fila : filas) {
            try {
                FilterCriteria criterio = mapper.readValue((String) fila[2], FilterCriteria.class);
                SavedFilter f = new SavedFilter((String) fila[1], criterio, usuario);
                f.setId(((Number) fila[0]).longValue());
                resultado.add(f);
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Filtro guardado con JSON inválido (id " + fila[0] + ")", e);
            }
        }
        return resultado;
    }
}