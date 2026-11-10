package model.dto;

/**
 * Cuerpo de POST /api/users (crear) y PUT /api/users/{id} (editar). El rol va con los nombres del cliente (ADMIN,
 * ANALISTA_TRANSITO, CONSULTOR_PUBLICO), los mismos del login. Al editar, una contraseña vacía o ausente significa
 * "dejar la actual". El toString omite la contraseña por si algún día se imprime la petición.
 */
public record UserRequest(String nombre, String correo, String rol, String contrasena) {

    @Override
    public String toString() {
        return "UserRequest[]";
    }
}
