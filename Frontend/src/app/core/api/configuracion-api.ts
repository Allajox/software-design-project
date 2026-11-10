import { OpcionApi } from './etiquetas-api';

/**
 * Configuración global del sistema (HU 30), con la forma de GET y PUT /api/config: los tres pesos del ISS y qué valores
 * de clima y de calzada cuentan como condición adversa. La define la persona administradora en «Usuarios y Configuración».
 */
export interface ConfiguracionApi {
  wFallecido: number;
  wHeridoGrave: number;
  wHeridoLeve: number;
  climaAdverso: string[];
  calzadaAdversa: string[];
}

/** Máximo que guarda la base (NUMERIC(8,2)); el servidor lo vuelve a revisar. */
export const PESO_MAXIMO = 999_999.99;

export type ClavePeso = 'wFallecido' | 'wHeridoGrave' | 'wHeridoLeve';

/** Los tres pesos, en el orden de la fórmula ISS = (W1·fallecidos + W2·graves + W3·leves) ÷ total de siniestros. */
export const PESOS: readonly { clave: ClavePeso; sigla: string; nombre: string; etiqueta: string; ayuda: string }[] = [
  { clave: 'wFallecido', sigla: 'W1', nombre: 'Peso por fallecido', etiqueta: 'Peso: fallecidos', ayuda: 'Cuánto cuenta cada persona fallecida en el ISS.' },
  { clave: 'wHeridoGrave', sigla: 'W2', nombre: 'Peso por herido grave', etiqueta: 'Peso: heridos graves', ayuda: 'Cuánto cuenta cada persona herida de gravedad.' },
  { clave: 'wHeridoLeve', sigla: 'W3', nombre: 'Peso por herido leve', etiqueta: 'Peso: heridos leves', ayuda: 'Cuánto cuenta cada persona herida leve.' },
];

/** Valores del enum Climate del servidor que se pueden marcar como adversos (el servidor rechaza cualquier otro). */
export const CLIMAS_CONFIG: readonly OpcionApi[] = [
  { valor: 'LLUVIA', texto: 'Lluvia' },
  { valor: 'NEBLINA', texto: 'Neblina' },
  { valor: 'LLUVIA_CON_NEBLINA', texto: 'Lluvia con neblina' },
  { valor: 'NUBLADO', texto: 'Nublado' },
  { valor: 'BUEN_TIEMPO', texto: 'Buen tiempo' },
];

/** Valores del enum RoadStatus del servidor que se pueden marcar como adversos. */
export const CALZADAS_CONFIG: readonly OpcionApi[] = [
  { valor: 'RESBALADIZA', texto: 'Resbaladiza' },
  { valor: 'MOJADA', texto: 'Mojada' },
  { valor: 'HUECOS', texto: 'Con huecos' },
  { valor: 'HUNDIMIENTOS', texto: 'Con hundimientos' },
  { valor: 'DERRUMBE', texto: 'Con derrumbe' },
  { valor: 'CONSTRUCCION_O_REPARACION', texto: 'En construcción o reparación' },
  { valor: 'SECA', texto: 'Seca' },
  { valor: 'BUENA', texto: 'Buena' },
  { valor: 'OTROS', texto: 'Otros' },
];

/** Lo que la persona tiene escrito en el formulario: los pesos como texto, para poder validar lo que tecleó. */
export interface FormularioConfig {
  wFallecido: string;
  wHeridoGrave: string;
  wHeridoLeve: string;
  climaAdverso: readonly string[];
  calzadaAdversa: readonly string[];
}

export type ErroresConfig = Partial<Record<ClavePeso | 'general', string>>;

/** 10 → «10»; 2.5 → «2,5» (coma decimal, como se escribe en español) */
export const pesoATexto = (n: number): string => String(n).replace('.', ',');

export function aFormulario(c: ConfiguracionApi): FormularioConfig {
  return {
    wFallecido: pesoATexto(c.wFallecido),
    wHeridoGrave: pesoATexto(c.wHeridoGrave),
    wHeridoLeve: pesoATexto(c.wHeridoLeve),
    climaAdverso: [...c.climaAdverso],
    calzadaAdversa: [...c.calzadaAdversa],
  };
}

/**
 * Convierte lo escrito en un peso, o explica por qué no sirve. Acepta «2,5» y «2.5»; no admite negativos, notación
 * científica, más de 2 decimales ni más de 999 999,99 (las mismas reglas que aplica el servidor).
 */
export function leerPeso(texto: string): { valor: number } | { error: string } {
  const t = texto.trim();
  if (t === '') return { error: 'Escriba un número.' };
  if (/^-/.test(t)) return { error: 'No puede ser negativo.' };
  if (!/^\d+([.,]\d*)?$/.test(t) || /[.,]$/.test(t)) return { error: 'Escriba un número, por ejemplo 10 o 2,5.' };
  const decimales = t.split(/[.,]/)[1] ?? '';
  if (decimales.replace(/0+$/, '').length > 2) return { error: 'Admite como máximo 2 decimales.' };
  const valor = Number(t.replace(',', '.'));
  if (valor > PESO_MAXIMO) return { error: 'No puede pasar de 999 999,99.' };
  return { valor };
}

/** Valida el formulario completo; si todo está bien devuelve la configuración lista para el PUT. */
export function validarConfig(f: FormularioConfig): { errores: ErroresConfig; valor?: ConfiguracionApi } {
  const errores: ErroresConfig = {};
  const valores: Partial<Record<ClavePeso, number>> = {};
  for (const p of PESOS) {
    const r = leerPeso(f[p.clave]);
    if ('error' in r) errores[p.clave] = r.error;
    else valores[p.clave] = r.valor;
  }
  if (Object.keys(errores).length > 0) return { errores };
  if (valores.wFallecido === 0 && valores.wHeridoGrave === 0 && valores.wHeridoLeve === 0) {
    return { errores: { general: 'Al menos un peso debe ser mayor que cero: con los tres en cero el ISS siempre valdría 0.' } };
  }
  return {
    errores,
    valor: {
      wFallecido: valores.wFallecido as number,
      wHeridoGrave: valores.wHeridoGrave as number,
      wHeridoLeve: valores.wHeridoLeve as number,
      climaAdverso: [...f.climaAdverso],
      calzadaAdversa: [...f.calzadaAdversa],
    },
  };
}

const mismosValores = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** ¿Los pesos escritos difieren de los guardados? Se comparan como números («10» y «10,0» son lo mismo). */
export function hayCambiosPesos(guardada: ConfiguracionApi, f: FormularioConfig): boolean {
  return PESOS.some((p) => {
    const r = leerPeso(f[p.clave]);
    return 'error' in r || r.valor !== guardada[p.clave];
  });
}

/** ¿El clima o la calzada marcados difieren de lo guardado? No importa el orden. */
export function hayCambiosAdversas(guardada: ConfiguracionApi, f: FormularioConfig): boolean {
  return !mismosValores(guardada.climaAdverso, f.climaAdverso) || !mismosValores(guardada.calzadaAdversa, f.calzadaAdversa);
}

/** ¿Lo escrito difiere de lo guardado en cualquier parte de la configuración? */
export function hayCambios(guardada: ConfiguracionApi, f: FormularioConfig): boolean {
  return hayCambiosPesos(guardada, f) || hayCambiosAdversas(guardada, f);
}

/**
 * Las opciones que se muestran: las conocidas más cualquier valor guardado que no esté en la lista (un valor nuevo del
 * servidor se ve y se puede desmarcar, en vez de quedar escondido).
 */
export function opcionesConDesconocidas(base: readonly OpcionApi[], seleccionadas: readonly string[]): OpcionApi[] {
  const extra = seleccionadas.filter((v) => !base.some((o) => o.valor === v)).map((v) => ({ valor: v, texto: v }));
  return [...base, ...extra];
}

/** Texto de la fórmula con los pesos que hay escritos (los que no son válidos se muestran como W1, W2 o W3). */
export function formulaIss(f: FormularioConfig): string {
  const parte = (clave: ClavePeso, sigla: string, plural: string): string => {
    const r = leerPeso(f[clave]);
    return `${'valor' in r ? pesoATexto(r.valor) : sigla}·${plural}`;
  };
  return `ISS = (${parte('wFallecido', 'W1', 'fallecidos')} + ${parte('wHeridoGrave', 'W2', 'heridos graves')} + ${parte('wHeridoLeve', 'W3', 'heridos leves')}) ÷ total de siniestros`;
}
