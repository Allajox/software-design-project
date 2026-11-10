package model.dto;

/**
 * Respuesta del login con la forma que espera el frontend (core/models/auth.models.ts):
 * {token, usuario: {id, nombre, correo, rol}}. El rol va con los nombres del cliente (ADMIN, ANALISTA_TRANSITO,
 * CONSULTOR_PUBLICO); en la base de datos son ADMIN, ANALISTA y CONSULTOR.
 */
public record AuthResponse(String token, Usuario usuario) {

    public record Usuario(long id, String nombre, String correo, String rol) {
    }
}
