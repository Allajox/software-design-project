package model;

import java.util.Optional;

/** Puerto de acceso a los usuarios. La implementación vive en app.persistence. */
public interface UserRepository {

    /** Usuario activo con ese correo (sin distinguir mayúsculas); vacío si no existe o está desactivado. */
    Optional<User> findByEmail(String email);
}
