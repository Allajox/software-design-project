package model.dto;

/** Cuerpo de PUT /api/users/{id}/active: true activa la cuenta y false la desactiva. */
public record UserStatusRequest(Boolean activo) { }
