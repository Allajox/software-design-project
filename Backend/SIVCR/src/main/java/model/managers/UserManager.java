package model.managers;

import enums.UserRole;
import java.util.List;
import java.util.regex.Pattern;
import model.PasswordHasher;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.UserAccount;
import model.UserAdminRepository;

/**
 * Gestión de usuarios (HU 29): crear cuentas con rol, editarlas, activarlas y desactivarlas. Las reglas se aplican
 * aquí, en el servidor, aunque la pantalla también las valide: la pantalla se puede saltar.
 *
 * - La contraseña se guarda solo como hash (PasswordHasher) y cumple la política: 8 a 64 caracteres con mayúscula,
 *   minúscula y número.
 * - El sistema siempre conserva al menos una persona administradora activa.
 * - Nadie desactiva su propia cuenta ni cambia su propio rol.
 * - Al desactivar una cuenta, cambiarle el rol o la contraseña, sus sesiones abiertas se cierran: si no, el cambio
 *   no tendría efecto hasta que venciera el token.
 *
 * Sin dependencias del framework.
 */
public class UserManager {

    static final int NOMBRE_MIN = 3;
    static final int NOMBRE_MAX = 60;
    static final int CORREO_MAX = 100;
    static final int CLAVE_MIN = 8;
    static final int CLAVE_MAX = 64;

    private static final Pattern FORMATO_CORREO = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final String SIN_ADMIN =
        "Es la única persona administradora activa. El sistema debe conservar al menos una.";

    private final UserAdminRepository usuarios;
    private final PasswordHasher hasher;
    private final AuthManager sesiones;

    public UserManager(UserAdminRepository usuarios, PasswordHasher hasher, AuthManager sesiones) {
        this.usuarios = usuarios;
        this.hasher = hasher;
        this.sesiones = sesiones;
    }

    public List<UserAccount> listar() {
        return usuarios.listar();
    }

    /** Crea una cuenta activa. 400 si algún dato no es válido; 409 si el correo ya existe. */
    public UserAccount crear(String nombre, String correo, UserRole rol, String contrasena) {
        String nombreLimpio = nombreValido(nombre);
        String correoLimpio = correoValido(correo);
        exigirRol(rol);
        exigirContrasenaValida(contrasena);
        exigirCorreoLibre(correoLimpio, 0);
        long id = usuarios.crear(nombreLimpio, correoLimpio, hasher.hash(contrasena), rol);
        return usuarios.buscar(id).orElseThrow();
    }

    /**
     * Cambia nombre, correo y rol; la contraseña solo si viene (vacía o null = dejar la actual).
     *
     * @param actorId el administrador que hace el cambio
     */
    public UserAccount actualizar(long id, String nombre, String correo, UserRole rol, String contrasena,
                                  long actorId) {
        UserAccount actual = existente(id);
        String nombreLimpio = nombreValido(nombre);
        String correoLimpio = correoValido(correo);
        exigirRol(rol);
        boolean cambiaClave = contrasena != null && !contrasena.isEmpty();
        if (cambiaClave) {
            exigirContrasenaValida(contrasena);
        }
        boolean cambiaRol = actual.rol() != rol;
        if (cambiaRol) {
            if (id == actorId) {
                throw invalido("No puede cambiar su propio rol. Pídaselo a otra persona administradora.");
            }
            if (actual.rol() == UserRole.ADMIN && actual.activo()) {
                exigirOtroAdministradorActivo();
            }
        }
        exigirCorreoLibre(correoLimpio, id);

        usuarios.actualizar(id, nombreLimpio, correoLimpio, rol);
        if (cambiaClave) {
            usuarios.cambiarClave(id, hasher.hash(contrasena));
        }
        // quien se edita a sí mismo conserva su sesión; a cualquier otra persona se le cierran para que el cambio rija
        if ((cambiaRol || cambiaClave) && id != actorId) {
            sesiones.cerrarSesionesDe(id);
        }
        return usuarios.buscar(id).orElseThrow();
    }

    /** Activa o desactiva una cuenta. Desactivar cierra sus sesiones abiertas. */
    public UserAccount cambiarEstado(long id, boolean activo, long actorId) {
        UserAccount actual = existente(id);
        if (actual.activo() == activo) {
            return actual; // ya estaba así: no cambia nada
        }
        if (!activo) {
            if (id == actorId) {
                throw invalido("No puede desactivar su propia cuenta.");
            }
            if (actual.rol() == UserRole.ADMIN) {
                exigirOtroAdministradorActivo();
            }
        }
        usuarios.cambiarEstado(id, activo);
        if (!activo) {
            sesiones.cerrarSesionesDe(id);
        }
        return usuarios.buscar(id).orElseThrow();
    }

    // ---------------------------------------------------------------------------------------------- validación

    private UserAccount existente(long id) {
        return usuarios.buscar(id).orElseThrow(() -> new SivcrException(Tipo.NO_ENCONTRADO,
            "No existe el usuario " + id + "."));
    }

    private void exigirOtroAdministradorActivo() {
        if (usuarios.contarAdministradoresActivos() <= 1) {
            throw invalido(SIN_ADMIN);
        }
    }

    private void exigirCorreoLibre(String correo, long excluirId) {
        if (usuarios.existeCorreo(correo, excluirId)) {
            throw new SivcrException(Tipo.CONFLICTO, "Ya existe una cuenta con ese correo.");
        }
    }

    private static void exigirRol(UserRole rol) {
        if (rol == null) {
            throw invalido("Elija un rol.");
        }
    }

    /** Sin caracteres de control, espacios dobles ni espacios en los bordes. */
    static String normalizarNombre(String nombre) {
        return nombre == null ? "" : nombre.replaceAll("\\p{Cntrl}", "").replaceAll("\\s+", " ").trim();
    }

    private static String nombreValido(String nombre) {
        String limpio = normalizarNombre(nombre);
        if (limpio.isEmpty()) {
            throw invalido("El nombre es obligatorio.");
        }
        if (limpio.length() < NOMBRE_MIN) {
            throw invalido("El nombre debe tener al menos " + NOMBRE_MIN + " caracteres.");
        }
        if (limpio.length() > NOMBRE_MAX) {
            throw invalido("El nombre no puede pasar de " + NOMBRE_MAX + " caracteres.");
        }
        if (!Pattern.compile("\\p{L}").matcher(limpio).find()) {
            throw invalido("El nombre debe incluir letras.");
        }
        return limpio;
    }

    private static String correoValido(String correo) {
        String limpio = correo == null ? "" : correo.trim().toLowerCase(java.util.Locale.ROOT);
        if (limpio.isEmpty()) {
            throw invalido("El correo es obligatorio.");
        }
        if (limpio.length() > CORREO_MAX) {
            throw invalido("El correo no puede pasar de " + CORREO_MAX + " caracteres.");
        }
        if (!FORMATO_CORREO.matcher(limpio).matches()) {
            throw invalido("Escriba un correo válido, como nombre@institucion.go.cr.");
        }
        return limpio;
    }

    private static void exigirContrasenaValida(String clave) {
        if (clave == null || clave.isEmpty()) {
            throw invalido("La contraseña es obligatoria.");
        }
        if (clave.length() > CLAVE_MAX) {
            throw invalido("La contraseña no puede pasar de " + CLAVE_MAX + " caracteres.");
        }
        boolean cumple = clave.length() >= CLAVE_MIN
            && Pattern.compile("\\p{Lu}").matcher(clave).find()
            && Pattern.compile("\\p{Ll}").matcher(clave).find()
            && Pattern.compile("\\d").matcher(clave).find();
        if (!cumple) {
            throw invalido("Use al menos " + CLAVE_MIN + " caracteres, con mayúscula, minúscula y número.");
        }
    }

    private static SivcrException invalido(String mensaje) {
        return new SivcrException(Tipo.SOLICITUD_INVALIDA, mensaje);
    }
}
