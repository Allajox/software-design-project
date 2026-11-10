package model;

import enums.UserRole;
import java.util.List;
import java.util.Optional;

/**
 * Puerto de la gestión de usuarios (HU 29). Extiende UserRepository, que solo busca cuentas activas para el login;
 * este además lista y cambia cuentas. La implementación vive en app.persistence.
 *
 * Los usuarios no se borran: ingestion_log, consultas guardadas e historial los referencian. Se desactivan.
 */
public interface UserAdminRepository extends UserRepository {

    /** Todas las cuentas, activas o no, por nombre. */
    List<UserAccount> listar();

    Optional<UserAccount> buscar(long id);

    /** ¿Hay otra cuenta (distinta de excluirId) con ese correo, sin distinguir mayúsculas? */
    boolean existeCorreo(String correo, long excluirId);

    /** Crea una cuenta activa y devuelve su id. 409 si el correo ya existe. */
    long crear(String nombre, String correo, String passwordHash, UserRole rol);

    void actualizar(long id, String nombre, String correo, UserRole rol);

    void cambiarClave(long id, String passwordHash);

    void cambiarEstado(long id, boolean activo);

    long contarAdministradoresActivos();
}
