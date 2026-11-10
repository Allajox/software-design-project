import { HttpErrorResponse } from '@angular/common/http';
import { RolUsuario } from '../models/auth.models';
import { normalizarCorreo, normalizarNombre } from '../usuarios/usuarios';
import { CuentaPublica, DatosFormularioUsuario, ErroresFormularioUsuario } from '../usuarios/usuarios.models';
import { mensajeDeError } from './errores-api';

/** Cuenta tal como la entrega GET /api/users (nunca trae contraseña ni hash). El servidor no registra el último acceso. */
export interface UsuarioApi {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
  /** ISO-8601 */
  creadoEn: string;
}

/** Cuerpo de POST /api/users y PUT /api/users/{id}. Al editar, una contraseña vacía significa «dejar la actual». */
export interface UsuarioPeticionApi {
  nombre: string;
  correo: string;
  rol: RolUsuario;
  contrasena: string;
}

/** Lo que devuelve guardar una cuenta: la cuenta guardada o los errores para mostrar junto a cada campo. */
export type ResultadoGuardadoApi =
  | { ok: true; cuenta: CuentaPublica }
  | { ok: false; errores: ErroresFormularioUsuario; general?: string };

/** La pantalla y el diálogo trabajan con CuentaPublica (la misma forma de la versión de demostración). */
export const aCuentaPublica = (u: UsuarioApi): CuentaPublica => ({
  id: u.id,
  nombre: u.nombre,
  correo: u.correo,
  rol: u.rol,
  activo: u.activo,
  creadoEn: u.creadoEn,
  ultimoAcceso: null,
});

/** Nombre y correo ya normalizados (sin espacios de más, correo en minúsculas), tal como los guarda el servidor. */
export const aPeticion = (d: DatosFormularioUsuario): UsuarioPeticionApi => ({
  nombre: normalizarNombre(d.nombre),
  correo: normalizarCorreo(d.correo),
  rol: d.rol,
  contrasena: d.contrasena,
});

/**
 * Convierte el error del servidor en lo que muestra el formulario: un 409 es «correo repetido» y va junto al campo
 * correo; el resto (400 con el motivo, sin conexión, sin permiso) va como mensaje general.
 */
export function errorDeGuardado(e: unknown): Extract<ResultadoGuardadoApi, { ok: false }> {
  const mensaje = mensajeDeError(e);
  if (e instanceof HttpErrorResponse && e.status === 409) return { ok: false, errores: { correo: mensaje } };
  return { ok: false, errores: {}, general: mensaje };
}
