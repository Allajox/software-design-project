/** Utilidades para comparar textos sin que importen mayúsculas, tildes ni espacios de más. */

export const sinAcentos = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Para comparar VALORES: "  San  JOSÉ " → "san jose" */
export const claveValor = (t: unknown): string =>
  sinAcentos(String(t ?? '')).toLowerCase().replace(/[\s ]+/g, ' ').trim();

/** Para comparar NOMBRES DE COLUMNA: "Heridos graves", "heridos_graves" y "HERIDOS-GRAVES" → "heridos_graves" */
export const claveCabecera = (t: unknown): string =>
  sinAcentos(String(t ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Distancia de Levenshtein: cuántas letras hay que cambiar para pasar de un texto a otro */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[b.length];
}

/** La opción más parecida al texto escrito ("Lluvía fuerte" → "Lluvia fuerte"), o null si ninguna se parece */
export function sugerir(valor: string, opciones: readonly string[], maxDistancia = 2): string | null {
  const v = claveValor(valor);
  if (v.length < 3) return null;
  let mejor: string | null = null;
  let mejorD = maxDistancia + 1;
  for (const o of opciones) {
    const d = distancia(v, claveValor(o));
    if (d < mejorD) {
      mejor = o;
      mejorD = d;
    }
  }
  return mejor;
}
