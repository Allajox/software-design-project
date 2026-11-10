package model;

import enums.UserRole;
import java.security.Principal;

/**
 * Usuario del sistema (fila de app_user). Es también el "principal" de la sesión: Spring Security llama getName() para
 * identificarlo, y aquí eso devuelve el correo (name() es el nombre para mostrar).
 * toString() no incluye el hash de la contraseña para que no salga en un log por accidente.
 */
public record User(long id, String name, String email, String passwordHash, UserRole rol) implements Principal {

    @Override
    public String getName() {
        return email;
    }

    @Override
    public String toString() {
        return "User[id=" + id + ", rol=" + rol + "]";
    }
}
