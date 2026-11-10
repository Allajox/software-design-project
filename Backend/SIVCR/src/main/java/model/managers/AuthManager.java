package model.managers;

import enums.UserRole;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import model.PasswordHasher;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.User;
import model.UserRepository;

/**
 * Autenticación y sesiones (HU 31), sin Spring. Las sesiones viven en memoria: el token es un valor aleatorio opaco,
 * así que cerrar sesión lo invalida al instante, y al reiniciar el servidor hay que volver a entrar.
 *
 * Uso desde otras funciones internas:
 * <pre>
 *   Sesion s = auth.login(correo, contrasena);   // s.id() es el id de app_user
 *   long usuarioId = auth.idDe(s.token());       // en las siguientes llamadas, con el token de la sesión
 * </pre>
 * Dentro de una petición HTTP, el usuario autenticado lo da CurrentUser.get().
 * El correo, la contraseña y el token nunca se escriben en un log desde aquí.
 */
public class AuthManager {

    /** Sesión abierta: el token que recibe el cliente, su usuario y cuándo vence. */
    public record Sesion(String token, User usuario, Instant expira) {
        public long id() {
            return usuario.id();
        }
    }

    private final UserRepository usuarios;
    private final PasswordHasher hasher;
    private final Duration duracion;
    private final Clock reloj;
    private final SecureRandom azar = new SecureRandom();
    private final Map<String, Sesion> sesiones = new ConcurrentHashMap<>();

    public AuthManager(UserRepository usuarios, PasswordHasher hasher, Duration duracion, Clock reloj) {
        this.usuarios = usuarios;
        this.hasher = hasher;
        this.duracion = duracion;
        this.reloj = reloj;
    }

    /**
     * Inicia sesión con correo y contraseña.
     *
     * @throws SivcrException NO_AUTENTICADO si el correo no existe, la cuenta está desactivada o la contraseña es
     *                        incorrecta (sin distinguirlos)
     */
    public Sesion login(String correo, String contrasena) {
        Optional<User> usuario = correo == null || correo.isBlank()
                ? Optional.empty() : usuarios.findByEmail(correo.strip());
        // se verifica SIEMPRE un hash (el falso si el correo no existe) para que el tiempo no delate qué correos existen
        boolean correcta = hasher.verify(contrasena, usuario.map(User::passwordHash).orElse(hasher.hashFalso()));
        if (usuario.isEmpty() || !correcta) {
            throw new SivcrException(Tipo.NO_AUTENTICADO, "Correo o contraseña incorrectos.");
        }
        Instant ahora = reloj.instant();
        sesiones.values().removeIf(s -> s.expira().isBefore(ahora));
        byte[] bytes = new byte[32];
        azar.nextBytes(bytes);
        Sesion sesion = new Sesion(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes), usuario.get(),
                ahora.plus(duracion));
        sesiones.put(sesion.token(), sesion);
        return sesion;
    }

    /** Usuario de un token vigente; vacío si el token es falso, ya se cerró o venció. */
    public Optional<User> usuarioDe(String token) {
        Sesion sesion = token == null ? null : sesiones.get(token);
        if (sesion == null) {
            return Optional.empty();
        }
        if (sesion.expira().isBefore(reloj.instant())) {
            sesiones.remove(token);
            return Optional.empty();
        }
        return Optional.of(sesion.usuario());
    }

    /** Atajo para las funciones internas que solo necesitan el id de app_user del usuario de la sesión. */
    public long idDe(String token) {
        return usuarioDe(token).orElseThrow(AuthManager::sesionInvalida).id();
    }

    /**
     * Devuelve el usuario del token si su rol es uno de {@code permitidos} (si no se indica ninguno, basta con tener
     * sesión).
     *
     * @throws SivcrException NO_AUTENTICADO (token inválido) o SIN_PERMISO
     */
    public User checkPermission(String token, UserRole... permitidos) {
        User usuario = usuarioDe(token).orElseThrow(AuthManager::sesionInvalida);
        for (UserRole rol : permitidos) {
            if (rol == usuario.rol()) {
                return usuario;
            }
        }
        if (permitidos.length > 0) {
            throw new SivcrException(Tipo.SIN_PERMISO, "No tiene permiso para realizar esta operación.");
        }
        return usuario;
    }

    /** Cierra la sesión del token. Es idempotente: un token que ya no existe no es un error. */
    public void logout(String token) {
        if (token != null) {
            sesiones.remove(token);
        }
    }

    /**
     * Cierra todas las sesiones abiertas de un usuario. La gestión de usuarios (HU 29) lo usa al desactivar una cuenta
     * o cambiarle el rol o la contraseña: la sesión guarda el rol con que se inició y sin esto el cambio no regiría
     * hasta que el token venciera.
     */
    public void cerrarSesionesDe(long usuarioId) {
        sesiones.values().removeIf(s -> s.usuario().id() == usuarioId);
    }

    private static SivcrException sesionInvalida() {
        return new SivcrException(Tipo.NO_AUTENTICADO, "La sesión no es válida o ya venció.");
    }
}
