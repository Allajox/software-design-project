import { Siniestro } from '../models/siniestro.models';
import { COLUMNAS, ColumnaTabla } from './tabla-siniestros';

/** Tabla lista para escribir en cualquier formato: encabezados + filas de valores */
export interface TablaPlana {
  columnas: string[];
  filas: (string | number)[][];
}

/** Arma la tabla a exportar. Sin `columnas` exporta todas; para el PDF se pasan solo las que caben. */
export function construirTabla(
  datos: readonly Siniestro[],
  columnas: readonly ColumnaTabla[] = COLUMNAS,
): TablaPlana {
  return {
    columnas: columnas.map((c) => c.titulo),
    filas: datos.map((s) => columnas.map((c) => c.exportar(s))),
  };
}

/**
 * Evita la "inyección de fórmulas": si un texto empieza con = + - @ (o tabulación/retorno),
 * Excel lo ejecuta como fórmula al abrir el archivo. Anteponer una comilla lo vuelve texto.
 */
export function neutralizarFormula(valor: string | number): string | number {
  if (typeof valor === 'number') return valor;
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/**
 * CSV con punto y coma: es lo que Excel en español abre bien al hacer doble clic
 * (con coma, todo quedaría en una sola columna). Líneas terminadas en CRLF.
 */
export function aCsv(tabla: TablaPlana, separador = ';'): string {
  const celda = (v: string | number): string => {
    const texto = String(neutralizarFormula(v));
    return /["\r\n]/.test(texto) || texto.includes(separador) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return [tabla.columnas, ...tabla.filas].map((fila) => fila.map(celda).join(separador)).join('\r\n');
}

/** "sivcr-siniestros-2026-11-08.csv", con la fecha local del usuario */
export function nombreArchivo(base: string, extension: string, fecha: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${base}-${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}.${extension}`;
}
