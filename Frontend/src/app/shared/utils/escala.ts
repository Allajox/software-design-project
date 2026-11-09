/** Escala «bonita» para un eje: límites y pasos redondos (1, 2, 5 × 10ⁿ) que cubren el rango de los datos */
export interface Escala {
  min: number;
  max: number;
  paso: number;
  ticks: number[];
}

const limpiar = (n: number): number => Number(n.toPrecision(12));

export function escalaNice(minimo: number, maximo: number, objetivoTicks = 5): Escala {
  let min = minimo;
  let max = maximo;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (max <= min) max = min + 1;
  const crudo = (max - min) / Math.max(1, objetivoTicks);
  const magnitud = Math.pow(10, Math.floor(Math.log10(crudo)));
  const normal = crudo / magnitud;
  const paso = limpiar((normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * magnitud);
  const lo = limpiar(Math.floor(min / paso + 1e-9) * paso);
  const hi = limpiar(Math.ceil(max / paso - 1e-9) * paso);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + paso / 1e6; v = limpiar(v + paso)) ticks.push(v);
  return { min: lo, max: hi, paso, ticks };
}

/** Posición (0-100) de un valor dentro de la escala */
export const posicion = (valor: number, escala: Pick<Escala, 'min' | 'max'>): number =>
  ((valor - escala.min) / (escala.max - escala.min)) * 100;
