import { HttpErrorResponse } from '@angular/common/http';
import { mensajeDeError } from './errores-api';

const error = (status: number, cuerpo?: unknown) => new HttpErrorResponse({ status, error: cuerpo });

describe('Mensajes de error del servidor', () => {
  it('sin conexión (status 0) explica qué revisar', () => {
    const m = mensajeDeError(error(0));
    expect(m).toContain('No se pudo conectar con el servidor');
    expect(m).toContain('localhost:8080');
  });

  it('en errores de uso muestra el mensaje que manda el servidor', () => {
    expect(mensajeDeError(error(400, { mensaje: 'El año debe estar entre 1900 y 2100.' }))).toBe('El año debe estar entre 1900 y 2100.');
    expect(mensajeDeError(error(409, { mensaje: 'Ya tienes un filtro guardado con el nombre "A".' }))).toContain('Ya tienes un filtro');
  });

  it('un 400 sin mensaje no deja pasar el cuerpo crudo', () => {
    const m = mensajeDeError(error(400, { status: 400, error: 'Bad Request', trace: 'java.lang...' }));
    expect(m).not.toContain('java');
    expect(m).toContain('no entendió');
  });

  it('401, 403, 404, 413 y 5xx tienen su propia explicación', () => {
    expect(mensajeDeError(error(401))).toContain('sesión');
    expect(mensajeDeError(error(403))).toContain('rol');
    expect(mensajeDeError(error(404))).toContain('no encontró');
    expect(mensajeDeError(error(413))).toContain('200 MB');
    expect(mensajeDeError(error(500, 'stack trace secreto'))).not.toContain('secreto');
    expect(mensajeDeError(error(503))).toContain('error interno');
  });

  it('algo que no es un error HTTP da un mensaje genérico', () => {
    expect(mensajeDeError(new Error('boom'))).toBe('Ocurrió un error inesperado. Intente de nuevo.');
    expect(mensajeDeError(undefined)).toBe('Ocurrió un error inesperado. Intente de nuevo.');
  });
});
