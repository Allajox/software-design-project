package controller;

import enums.UserRole;
import model.User;
import model.dto.AuthResponse;
import model.dto.LoginRequest;
import model.managers.AuthManager;
import model.managers.AuthManager.Sesion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Inicio y cierre de sesión (HU 31). Solo POST /api/auth/login es público; el token que devuelve viaja luego como
 * "Authorization: Bearer ..." y TokenAuthenticationFilter lo convierte en el usuario autenticado.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthManager auth;

    public AuthController(AuthManager auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest peticion) {
        Sesion sesion = auth.login(peticion.correo(), peticion.contrasena());
        User u = sesion.usuario();
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store") // la respuesta lleva una credencial
                .body(new AuthResponse(sesion.token(),
                        new AuthResponse.Usuario(u.id(), u.name(), u.email(), rolParaElCliente(u.rol()))));
    }

    /** Cierra la sesión del token con que se llama (las credenciales de la petición son ese token). */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(Authentication autenticacion) {
        if (autenticacion.getCredentials() instanceof String token) {
            auth.logout(token);
        }
    }

    /** Nombres de rol del frontend; en la base de datos son ADMIN, ANALISTA y CONSULTOR. */
    static String rolParaElCliente(UserRole rol) {
        return switch (rol) {
            case ADMIN -> "ADMIN";
            case ANALISTA -> "ANALISTA_TRANSITO";
            case CONSULTOR -> "CONSULTOR_PUBLICO";
        };
    }
}
