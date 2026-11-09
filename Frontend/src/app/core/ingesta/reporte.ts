import { aCsv } from '../services/exportacion';
import { CAMPOS_PLANTILLA } from './esquema';
import { CodigoProblema, ResultadoIngesta } from './validacion';
import { aTexto } from './valores';

/** Cómo se llama cada tipo de problema en pantalla y en los reportes */
export const ETIQUETA_CODIGO: Record<CodigoProblema, string> = {
  estructura: 'Estructura de la fila',
  faltante: 'Dato faltante',
  tipo: 'Tipo de dato inválido',
  catalogo: 'Valor no permitido',
  rango: 'Fuera de rango',
  coordenadas: 'Coordenadas',
  consistencia: 'Datos contradictorios',
  atipico: 'Valor atípico',
  duplicado: 'Duplicado',
};

/** Reporte de calidad: un renglón por problema encontrado (se abre bien en Excel) */
export function problemasACsv(r: ResultadoIngesta): string {
  return aCsv({
    columnas: ['Fila', 'Gravedad', 'Tipo', 'Campo', 'Problema', 'Valor recibido'],
    filas: r.problemas.map((p) => [
      p.fila, p.gravedad === 'error' ? 'Error' : 'Advertencia', ETIQUETA_CODIGO[p.codigo], p.campo, p.mensaje, p.valor,
    ]),
  });
}

/** Las filas rechazadas tal como venían, más el motivo, para corregirlas y volver a cargarlas */
export function rechazadasACsv(r: ResultadoIngesta, cabeceras: readonly string[]): string {
  return aCsv({
    columnas: ['Fila del archivo', 'Motivos', ...cabeceras],
    filas: r.rechazadas.map((f) => [f.fila, f.motivos.join(' | '), ...cabeceras.map((h) => aTexto(f.valores[h], 500))]),
  });
}

/** Archivo de ejemplo con las columnas del sistema y una fila válida */
export function plantillaCsv(): string {
  return aCsv({
    columnas: CAMPOS_PLANTILLA.map((c) => c.titulo),
    // los números van como número (un texto que empieza con «-» se marcaría como posible fórmula)
    filas: [CAMPOS_PLANTILLA.map((c) => (/^-?\d+(\.\d+)?$/.test(c.ejemplo) ? Number(c.ejemplo) : c.ejemplo))],
  });
}
