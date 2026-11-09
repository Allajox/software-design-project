package model;

import java.util.Collection;
import java.util.List;

/**
 * Contrato de persistencia del dominio. No depende de Spring ni de JPA: las
 * implementaciones viven en la capa de infraestructura (paquete app.persistence).
 *
 * Los métodos de consulta específicos de cada agregado se declaran en
 * interfaces que extienden esta (por ejemplo IngestionLogRepository).
 *
 * NOTA: antes esta interfaz no era genérica y declaraba findByEmail, que
 * pertenece al bloque de autenticación (UserRepository).
 */
public interface Repository<T> {

    /** Inserta o actualiza la entidad y devuelve la versión persistida. */
    T save(T entity);

    /** Inserta o actualiza varias entidades en una sola operación por lotes. */
    List<T> saveAll(Collection<T> entities);

    long count();
}
