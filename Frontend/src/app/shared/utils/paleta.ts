/**
 * Colores de los gráficos.
 *  - serie1 / serie2: dos categorías (azul y naranja), p. ej. género en la pirámide.
 *    Validadas con validate_palette.js (modo claro): separación para daltonismo ΔE 24,7
 *    y visión normal ΔE 33,6 (el mínimo recomendado es 8 y 15).
 *  - barras de una sola serie usan serie1; lo no seleccionado se atenúa a gris.
 *  - secuencial: una sola tonalidad (azul), de claro a oscuro, para magnitud (mapa de calor).
 *  - severidad: 3 pasos ORDENADOS del mismo azul (más oscuro = más grave). Es una rampa
 *    ordinal, no categórica; el paso más claro tiene poco contraste con el fondo, por eso
 *    la leyenda siempre muestra el nombre y el valor, y existe la vista de tabla.
 */
export const PALETA = {
  serie1: '#2a78d6',
  serie2: '#eb6834',
  atenuado: '#c3c2b7',
  secuencial: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  /** Celdas del mapa de calor con valor 0 */
  vacio: '#f0efec',
  severidad: {
    Leve: '#86b6ef',
    Grave: '#2a78d6',
    Fallecido: '#104281',
  } as Record<string, string>,
} as const;
