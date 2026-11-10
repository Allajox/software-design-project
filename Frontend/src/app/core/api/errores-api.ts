import { HttpErrorResponse } from '@angular/common/http';
import { API_CONFIG } from '../config/api.config';

/** Límite de tamaño de archivo del backend (spring.servlet.multipart en application.yml). */
export const LIMITE_ARCHIVO_MB = 200;

function mensajeDelCuerpo(cuerpo: unknown): string | null {
  if (typeof cuerpo === 'object' && cuerpo !== null && 'mensaje' in cuerpo) {
    const m = (cuerpo as { mensaje: unknown }).mensaje;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return null;
}

/**
 * Convierte un error de HttpClient en una frase para la persona. Nunca muestra el cuerpo crudo ni datos técnicos.
 * El backend responde `{"mensaje": "..."}` en los errores de uso (400, 409, 413); el resto se explica aquí.
 */
export function mensajeDeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Ocurrió un error inesperado. Intente de nuevo.';
  const delServidor = mensajeDelCuerpo(error.error);
  switch (true) {
    case error.status === 0:
      return `No se pudo conectar con el servidor (${API_CONFIG.baseUrl}). Revise que el backend esté en ejecución y vuelva a intentar.`;
    case delServidor !== null && [400, 409, 413, 422].includes(error.status):
      return delServidor as string;
    case error.status === 400:
      return 'El servidor no entendió la solicitud. Revise los datos e intente de nuevo.';
    case error.status === 401:
      return 'El servidor no reconoce su sesión. Cierre sesión y vuelva a entrar.';
    case error.status === 403:
      return 'Su rol no tiene permiso para esta operación en el servidor.';
    case error.status === 404:
      return delServidor ?? 'El servidor no encontró lo que se pidió.';
    case error.status === 413:
      return `El archivo supera el tamaño máximo permitido (${LIMITE_ARCHIVO_MB} MB).`;
    case error.status >= 500:
      return 'El servidor tuvo un error interno. Intente de nuevo; si sigue pasando, avise al equipo de backend.';
    default:
      return 'No se pudo completar la operación. Intente de nuevo.';
  }
}
