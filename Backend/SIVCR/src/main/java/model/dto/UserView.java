package model.dto;

/**
 * Cuenta tal como sale por la API: nunca lleva el hash ni la contraseña. rol con los nombres del cliente (ADMIN,
 * ANALISTA_TRANSITO, CONSULTOR_PUBLICO); creadoEn en ISO-8601. El sistema no registra el último acceso, así que ese
 * dato no existe aquí.
 */
public record UserView(long id, String nombre, String correo, String rol, boolean activo, String creadoEn) { }
