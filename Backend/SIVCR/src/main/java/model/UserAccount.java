package model;

import enums.UserRole;
import java.time.LocalDateTime;

/**
 * Cuenta de usuario tal como la ve la pantalla de administración: SIN el hash de la contraseña (que nunca sale de la
 * capa de persistencia y del login). Incluye las cuentas desactivadas, a diferencia de User, que solo existe para
 * cuentas activas.
 */
public record UserAccount(long id, String nombre, String correo, UserRole rol, boolean activo,
                          LocalDateTime creadoEn) { }
