/** Formato numérico en español de Costa Rica (coma decimal, espacio para los miles) */
const entero = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtEntero = (n: number): string => entero.format(n);
export const fmtDec1 = (n: number): string => decimal1.format(n);
export const fmtDec2 = (n: number): string => decimal2.format(n);
export const fmtPct = (n: number): string => `${decimal1.format(n)} %`;

const fechaHora = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
/** «5 nov 2026, 2:20 p. m.» a partir de una fecha ISO */
export const fmtFechaHora = (iso: string): string => fechaHora.format(new Date(iso));

const fecha = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium' });
/** «5 nov 2026» a partir de una fecha ISO */
export const fmtFecha = (iso: string): string => fecha.format(new Date(iso));
