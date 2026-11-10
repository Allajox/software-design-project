package controller;

import enums.UserRole;
import java.util.List;
import java.util.Locale;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.UserAccount;
import model.dto.UserRequest;
import model.dto.UserStatusRequest;
import model.dto.UserView;
import model.managers.UserManager;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Gestión de usuarios (HU 29), solo para ADMIN. Solo recibe, delega en UserManager y responde; las reglas están en el
 * manager. Los roles viajan con los nombres del cliente (ADMIN, ANALISTA_TRANSITO, CONSULTOR_PUBLICO), los mismos del
 * login. No hay DELETE: las cuentas se desactivan, porque cargas, consultas e historial las referencian.
 */
@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserController {

    private final UserManager usuarios;
    private final CurrentUser actual;

    public UserController(UserManager usuarios, CurrentUser actual) {
        this.usuarios = usuarios;
        this.actual = actual;
    }

    /** Todas las cuentas, activas o no, por nombre. */
    @GetMapping
    public List<UserView> listar() {
        return usuarios.listar().stream().map(UserController::aVista).toList();
    }

    /** Crea una cuenta activa. 400 si un dato no es válido; 409 si el correo ya existe. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserView crear(@RequestBody UserRequest cuerpo) {
        return aVista(usuarios.crear(cuerpo.nombre(), cuerpo.correo(), rol(cuerpo.rol()), cuerpo.contrasena()));
    }

    /** Edita nombre, correo y rol; la contraseña solo si viene (vacía = dejar la actual). */
    @PutMapping("/{id}")
    public UserView actualizar(@PathVariable("id") long id, @RequestBody UserRequest cuerpo) {
        return aVista(usuarios.actualizar(id, cuerpo.nombre(), cuerpo.correo(), rol(cuerpo.rol()),
            cuerpo.contrasena(), actual.get().id()));
    }

    /** Activa (true) o desactiva (false) la cuenta. Desactivar cierra sus sesiones. */
    @PutMapping("/{id}/active")
    public UserView cambiarEstado(@PathVariable("id") long id, @RequestBody UserStatusRequest cuerpo) {
        if (cuerpo == null || cuerpo.activo() == null) {
            throw new SivcrException(Tipo.SOLICITUD_INVALIDA, "Falta el campo activo (true o false).");
        }
        return aVista(usuarios.cambiarEstado(id, cuerpo.activo(), actual.get().id()));
    }

    /** Del nombre del cliente (ADMIN, ANALISTA_TRANSITO, CONSULTOR_PUBLICO) al rol del sistema. */
    static UserRole rol(String delCliente) {
        if (delCliente != null) {
            for (UserRole rol : UserRole.values()) {
                if (AuthController.rolParaElCliente(rol).equals(delCliente.trim().toUpperCase(Locale.ROOT))) {
                    return rol;
                }
            }
        }
        throw new SivcrException(Tipo.SOLICITUD_INVALIDA,
            "Rol no válido. Use ADMIN, ANALISTA_TRANSITO o CONSULTOR_PUBLICO.");
    }

    private static UserView aVista(UserAccount cuenta) {
        return new UserView(cuenta.id(), cuenta.nombre(), cuenta.correo(), AuthController.rolParaElCliente(cuenta.rol()),
            cuenta.activo(), cuenta.creadoEn().toString());
    }
}
