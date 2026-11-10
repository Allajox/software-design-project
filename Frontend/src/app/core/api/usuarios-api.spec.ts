import { HttpErrorResponse } from '@angular/common/http';
import { aCuentaPublica, aPeticion, errorDeGuardado } from './usuarios-api';

describe('Cuentas del servidor: conversiones', () => {
  it('la cuenta del servidor se muestra con la forma de la pantalla (sin último acceso, que el servidor no registra)', () => {
    const c = aCuentaPublica({
      id: 4, nombre: 'Ana Ruiz', correo: 'ana@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', activo: true, creadoEn: '2026-11-09T10:00:00Z',
    });
    expect(c).toEqual({
      id: 4, nombre: 'Ana Ruiz', correo: 'ana@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', activo: true, creadoEn: '2026-11-09T10:00:00Z', ultimoAcceso: null,
    });
    expect('contrasena' in c || 'clave' in c).toBe(false);
  });

  it('la petición lleva el nombre y el correo normalizados', () => {
    expect(aPeticion({ nombre: '  Marta   Ruiz  Mora ', correo: ' Marta@SIVCR.go.cr ', rol: 'ADMIN', contrasena: 'Clave1234' })).toEqual({
      nombre: 'Marta Ruiz Mora', correo: 'marta@sivcr.go.cr', rol: 'ADMIN', contrasena: 'Clave1234',
    });
  });

  it('al editar, la contraseña vacía viaja vacía (el servidor la toma como «dejar la actual»)', () => {
    expect(aPeticion({ nombre: 'Ana Ruiz', correo: 'ana@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: '' }).contrasena).toBe('');
  });

  describe('errorDeGuardado', () => {
    it('un 409 es «correo repetido» y va junto al campo correo', () => {
      const e = new HttpErrorResponse({ status: 409, error: { mensaje: 'Ya existe una cuenta con ese correo.' } });
      expect(errorDeGuardado(e)).toEqual({ ok: false, errores: { correo: 'Ya existe una cuenta con ese correo.' } });
    });

    it('un 400 muestra el motivo del servidor como mensaje general', () => {
      const e = new HttpErrorResponse({ status: 400, error: { mensaje: 'Elija un rol.' } });
      expect(errorDeGuardado(e)).toEqual({ ok: false, errores: {}, general: 'Elija un rol.' });
    });

    it('sin conexión o sin permiso explica qué pasó, sin datos técnicos', () => {
      expect(errorDeGuardado(new HttpErrorResponse({ status: 0 }))).toMatchObject({ ok: false, general: expect.stringContaining('No se pudo conectar') });
      expect(errorDeGuardado(new HttpErrorResponse({ status: 403 }))).toMatchObject({ general: expect.stringContaining('no tiene permiso') });
      expect(errorDeGuardado(new Error('boom'))).toMatchObject({ general: 'Ocurrió un error inesperado. Intente de nuevo.' });
    });
  });
});
