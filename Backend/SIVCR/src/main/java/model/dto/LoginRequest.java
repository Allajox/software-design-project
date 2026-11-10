package model.dto;

/** Cuerpo de POST /api/auth/login. El toString omite la contraseña por si algún día se imprime la petición. */
public record LoginRequest(String correo, String contrasena) {

    @Override
    public String toString() {
        return "LoginRequest[]";
    }
}
