package app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

/**
 * Activa @PreAuthorize. La verificación del rol ADMIN en IngestionController se hace en el servidor,
 * no en Angular: el guard del frontend es solo comodidad.
 *
 * Espera que la autenticación (bloque de seguridad) deje en el contexto una Authentication con la autoridad
 * ROLE_ADMIN para el administrador y cuyo getName() sea el correo del usuario (ver SecurityContextCurrentUserProvider).
 */
@Configuration
@EnableMethodSecurity
public class MethodSecurityConfig {
}
