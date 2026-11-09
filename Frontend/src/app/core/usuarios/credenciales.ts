/**
 * Contraseñas: nunca se guardan tal cual, solo su «hash» (una huella que no se puede revertir).
 * Se usa PBKDF2 con SHA-256, una sal aleatoria distinta por cuenta y muchas iteraciones para
 * que adivinar contraseñas sea lento. Todo con la Web Crypto del navegador, sin librerías.
 *
 * IMPORTANTE: esto protege lo que queda en el navegador durante la demostración. En el sistema
 * real las contraseñas las guarda y verifica el SERVIDOR (con bcrypt, scrypt o Argon2).
 */

const PREFIJO = 'pbkdf2-sha256';
export const ITERACIONES = 120_000;
const BYTES_SAL = 16;
const BYTES_HASH = 32;

/** Un hash guardado debe verse así; el rango de iteraciones evita que un valor manipulado congele la pestaña */
const FORMATO = /^pbkdf2-sha256\$(\d{4,7})\$([A-Za-z0-9+/]{22,24}={0,2})\$([A-Za-z0-9+/]{43}=)$/;
const ITERACIONES_MIN = 1_000;
const ITERACIONES_MAX = 1_000_000;

export function esHashValido(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const m = FORMATO.exec(valor);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= ITERACIONES_MIN && n <= ITERACIONES_MAX;
}

const aBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const deBase64 = (texto: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

function motorCriptografico(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Este navegador no ofrece criptografía (Web Crypto). Abra la aplicación desde localhost o por HTTPS.');
  }
  return subtle;
}

async function derivar(contrasena: string, sal: Uint8Array<ArrayBuffer>, iteraciones: number): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = motorCriptografico();
  const material = await subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, material, BYTES_HASH * 8);
  return new Uint8Array(bits);
}

/** Convierte una contraseña en el texto que se guarda. Dos llamadas con la misma contraseña dan textos distintos (sal). */
export async function hashearContrasena(contrasena: string, iteraciones = ITERACIONES): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(contrasena, sal, iteraciones);
  return `${PREFIJO}$${iteraciones}$${aBase64(sal)}$${aBase64(hash)}`;
}

/** ¿Esta contraseña corresponde al hash guardado? Un hash mal formado nunca coincide. */
export async function verificarContrasena(contrasena: string, almacenado: string): Promise<boolean> {
  const m = esHashValido(almacenado) ? FORMATO.exec(almacenado) : null;
  if (!m) return false;
  const esperado = deBase64(m[3]);
  const obtenido = await derivar(contrasena, deBase64(m[2]), Number(m[1]));
  if (esperado.length !== obtenido.length) return false;
  let diferencia = 0; // se recorre todo siempre, sin salir al primer error
  for (let i = 0; i < esperado.length; i++) diferencia |= esperado[i] ^ obtenido[i];
  return diferencia === 0;
}

/** Entero aleatorio en [0, max) con números del navegador (criptográficos) y sin sesgo de módulo */
export function enteroAleatorio(max: number): number {
  const limite = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limite);
  return buffer[0] % max;
}
