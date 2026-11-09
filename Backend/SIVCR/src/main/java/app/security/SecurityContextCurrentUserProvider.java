package app.security;

import app.persistence.AppUserViewRepository;
import model.ingestion.CurrentUserProvider;
import model.ingestion.IngestionException;
import model.ingestion.UserRef;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Identifica al usuario de la solicitud a partir de Spring Security.
 *
 * SUPUESTO a coordinar con el bloque de autenticación: Authentication.getName() es el correo electrónico del
 * usuario (por ejemplo, el "subject" del JWT). Con él se busca la fila de app_user para registrar quién hizo la carga.
 */
@Component
public class SecurityContextCurrentUserProvider implements CurrentUserProvider {

    private final AppUserViewRepository usuarios;

    public SecurityContextCurrentUserProvider(AppUserViewRepository usuarios) {
        this.usuarios = usuarios;
    }

    @Override
    public UserRef actual() {
        Authentication autenticacion = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacion == null || !autenticacion.isAuthenticated() || autenticacion.getName() == null) {
            throw new IngestionException("No hay un usuario autenticado.");
        }
        return usuarios.findFirstByEmailIgnoreCase(autenticacion.getName())
                .map(u -> new UserRef(u.id, u.name))
                .orElseThrow(() -> new IngestionException("El usuario autenticado no existe en la base de datos."));
    }
}
