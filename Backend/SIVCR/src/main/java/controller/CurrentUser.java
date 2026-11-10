package controller;

import model.SivcrException;
import model.SivcrException.Tipo;
import model.User;
import model.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Usuario de la petición actual, para que los controladores sepan a nombre de quién actúan.
 *
 * Con un token de POST /api/auth/login el principal ya es el User (con su id). En los demás casos (los tokens falsos
 * del perfil dev y el user(...) de las pruebas de integración) Authentication.getName() es el correo y con él se busca
 * la fila de app_user.
 */
@Component
public class CurrentUser {

    private final UserRepository usuarios;

    public CurrentUser(UserRepository usuarios) {
        this.usuarios = usuarios;
    }

    public User get() {
        Authentication autenticacion = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacion == null || !autenticacion.isAuthenticated()) {
            throw new SivcrException(Tipo.NO_AUTENTICADO, "No hay un usuario autenticado.");
        }
        if (autenticacion.getPrincipal() instanceof User usuario) {
            return usuario;
        }
        return usuarios.findByEmail(autenticacion.getName()).orElseThrow(
                () -> new SivcrException(Tipo.NO_AUTENTICADO, "No se pudo identificar al usuario autenticado."));
    }
}
