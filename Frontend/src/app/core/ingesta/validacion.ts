import { ANIOS, Anio, Provincia } from '../models/catalogos';
import { Siniestro, SiniestroNuevo } from '../models/siniestro.models';
import { CAMPOS, CampoEsquema, campoDeCabecera } from './esquema';
import { FilaCruda, Formato, TablaCruda } from './lector';
import { sugerir } from './normalizar';
import {
  aTexto, celdaVacia, franjaDeHora, opcionesDe, parsearBooleano, parsearEntero, parsearFecha, parsearHora,
  parsearNumero, resolverCanton, resolverCatalogo, resolverDistrito, resolverEdad, resolverRuta,
} from './valores';

/**
 * Validación de la ingesta (RF-1). Recibe una tabla cruda y devuelve los registros válidos
 * más un reporte de calidad: qué filas se rechazan y por qué, qué se importa con advertencias,
 * qué está duplicado y qué tan completo viene cada campo.
 */

export type Gravedad = 'error' | 'advertencia';

export type CodigoProblema =
  | 'estructura'    // la fila no tiene la forma esperada
  | 'faltante'      // falta un dato obligatorio
  | 'tipo'          // no es un número, fecha o sí/no válido
  | 'catalogo'      // valor que no está en la lista permitida
  | 'rango'         // fuera de lo permitido (año, kilómetro, conteos…)
  | 'coordenadas'   // latitud/longitud inválidas o fuera de Costa Rica
  | 'consistencia'  // datos que se contradicen entre sí
  | 'atipico'       // valor posible pero poco común
  | 'duplicado';    // el mismo siniestro ya está cargado

export interface Problema {
  /** Fila (tablas) o posición del registro (JSON) */
  fila: number;
  gravedad: Gravedad;
  codigo: CodigoProblema;
  /** Título de la columna afectada ("" si afecta a toda la fila) */
  campo: string;
  mensaje: string;
  /** Lo que venía en el archivo (recortado) */
  valor: string;
}

export interface FilaRechazada {
  fila: number;
  valores: Record<string, unknown>;
  motivos: string[];
}

export type RegistroNuevo = SiniestroNuevo;

export interface CompletitudCampo {
  clave: string;
  titulo: string;
  obligatorio: boolean;
  /** ¿Existe la columna en el archivo? */
  enArchivo: boolean;
  presentes: number;
  total: number;
  pct: number;
}

export interface Estructura {
  /** Columnas del archivo que se reconocieron → campo del esquema */
  reconocidas: { cabecera: string; campo: CampoEsquema }[];
  /** Columnas que el sistema no usa (se ignoran) */
  ignoradas: string[];
  /** Columnas obligatorias que no vienen en el archivo */
  faltantes: string[];
  /** Dos columnas del archivo apuntan al mismo campo: solo se usa la primera */
  repetidas: string[];
}

export interface ResultadoIngesta {
  formato: Formato;
  /** Filas con datos (sin contar las completamente vacías) */
  filasLeidas: number;
  filasVacias: number;
  estructura: Estructura;
  registros: RegistroNuevo[];
  importables: number;
  conAdvertencias: number;
  rechazados: number;
  duplicadosArchivo: number;
  duplicadosSistema: number;
  problemas: Problema[];
  /** Cuántos problemas existen en realidad (la lista `problemas` se recorta para no gastar memoria) */
  totalProblemas: number;
  problemasTruncados: boolean;
  porCodigo: Partial<Record<CodigoProblema, number>>;
  rechazadas: FilaRechazada[];
  completitud: CompletitudCampo[];
  /** Porcentaje de filas utilizables (importables / filas leídas) */
  calidadPct: number;
  puedeImportar: boolean;
}

export interface OpcionesValidacion {
  /** Datos que ya están en el sistema (para detectar duplicados) */
  existentes?: readonly Siniestro[];
  /** "Hoy", para rechazar fechas futuras (inyectable para las pruebas) */
  hoy?: Date;
}

export const MAX_PROBLEMAS_GUARDADOS = 10_000;
const LIMITES = { kmMax: 700, conteoMax: 100, conteoAtipico: 10, respuestaMax: 720, respuestaAtipica: 180 };
/** Caja que contiene a Costa Rica (incluye la Isla del Coco) */
export const CAJA_CR = { latMin: 5.4, latMax: 11.3, lonMin: -87.2, lonMax: -82.5 };
const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

const etiquetaPeriodo = `${ANIOS[0]}–${ANIOS[ANIOS.length - 1]}`;

/** Huella para reconocer el mismo siniestro cargado dos veces */
export function claveDuplicado(s: RegistroNuevo): string {
  return [
    s.fecha, s.franja, s.provincia, s.canton, s.distrito, s.ruta, s.kilometro, s.vehiculo, s.severidad,
    s.fallecidos, s.heridosGraves, s.heridosLeves, s.clima, s.calzada, s.senalizacion ? 1 : 0, s.edad, s.genero,
    s.condicion, s.tiempoRespuestaMin,
  ].join('|');
}

// ---------- Estructura ----------

export function analizarEstructura(cabeceras: readonly string[]): { estructura: Estructura; mapa: Map<string, string> } {
  const mapa = new Map<string, string>(); // clave del campo → cabecera del archivo
  const reconocidas: Estructura['reconocidas'] = [];
  const ignoradas: string[] = [];
  const repetidas: string[] = [];
  for (const h of cabeceras) {
    const campo = campoDeCabecera(h);
    if (!campo) {
      if (h.trim()) ignoradas.push(h);
    } else if (mapa.has(campo.clave)) repetidas.push(h);
    else {
      mapa.set(campo.clave, h);
      reconocidas.push({ cabecera: h, campo });
    }
  }
  const faltantes = CAMPOS.filter((c) => c.obligatorio && !mapa.has(c.clave)).map((c) => c.titulo);
  if (!mapa.has('franja') && !mapa.has('hora')) faltantes.push('Franja (o Hora)');
  return { estructura: { reconocidas, ignoradas, faltantes, repetidas }, mapa };
}

// ---------- Una fila ----------

interface ResultadoFila {
  registro?: RegistroNuevo;
  problemas: Problema[];
}

function validarFila(fila: FilaCruda, mapa: ReadonlyMap<string, string>, hoy: Date): ResultadoFila {
  const problemas: Problema[] = [];
  const titulo = (clave: string) => CAMPOS.find((c) => c.clave === clave)?.titulo ?? clave;
  const crudo = (clave: string): unknown => {
    const cab = mapa.get(clave);
    return cab === undefined ? undefined : fila.valores[cab];
  };
  const anotar = (gravedad: Gravedad, codigo: CodigoProblema, clave: string, mensaje: string, valor: unknown = '') =>
    problemas.push({ fila: fila.numero, gravedad, codigo, campo: clave ? titulo(clave) : '', mensaje, valor: aTexto(valor) });
  const error = (codigo: CodigoProblema, clave: string, mensaje: string, valor?: unknown) => anotar('error', codigo, clave, mensaje, valor);
  const aviso = (codigo: CodigoProblema, clave: string, mensaje: string, valor?: unknown) => anotar('advertencia', codigo, clave, mensaje, valor);
  const faltante = (clave: string) => error('faltante', clave, `Falta el dato obligatorio «${titulo(clave)}».`);

  if (fila.errorEstructura) {
    error('estructura', '', fila.errorEstructura);
    return { problemas };
  }

  // --- Catálogos simples ---
  const catalogo = (clave: string): string | null => {
    const v = crudo(clave);
    if (celdaVacia(v)) { faltante(clave); return null; }
    const r = resolverCatalogo(clave, v);
    if (r) return r;
    const sug = sugerir(aTexto(v), opcionesDe(clave));
    error('catalogo', clave, `«${aTexto(v)}» no es un valor válido de ${titulo(clave)}.${sug ? ` ¿Quiso decir «${sug}»?` : ` Valores: ${opcionesDe(clave).join(', ')}.`}`, v);
    return null;
  };

  // --- Fecha, hora y franja ---
  let fechaIso: string | null = null;
  let anio = 0, mes = 0, diaSemana: string | null = null;
  let horaDeFecha: number | undefined;
  const vf = crudo('fecha');
  if (celdaVacia(vf)) faltante('fecha');
  else {
    const f = parsearFecha(vf);
    if (!f.ok) {
      error('tipo', 'fecha',
        f.motivo === 'calendario' ? `La fecha «${aTexto(vf)}» no existe en el calendario.` : `«${aTexto(vf)}» no se reconoce como fecha. Use AAAA-MM-DD o DD/MM/AAAA.`, vf);
    } else {
      const { anio: a, mes: m, dia: d, hora } = f.fecha;
      horaDeFecha = hora;
      const ts = Date.UTC(a, m - 1, d);
      if (!(ANIOS as readonly number[]).includes(a)) {
        error('rango', 'fecha', `El año ${a} está fuera del periodo que maneja el sistema (${etiquetaPeriodo}).`, vf);
      } else if (ts > Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) {
        error('rango', 'fecha', 'La fecha es posterior a hoy.', vf);
      } else {
        anio = a;
        mes = m;
        fechaIso = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        diaSemana = NOMBRE_DIA[new Date(ts).getUTCDay()];
      }
    }
  }

  let franja: string | null = null;
  const vh = crudo('hora');
  const vfr = crudo('franja');
  let hora: number | null = null;
  if (!celdaVacia(vh)) {
    hora = parsearHora(vh);
    if (hora === null) error('tipo', 'hora', `«${aTexto(vh)}» no es una hora válida. Use HH:MM en formato de 24 horas.`, vh);
  } else if (horaDeFecha !== undefined) hora = horaDeFecha;

  if (!celdaVacia(vfr)) {
    franja = resolverCatalogo('franja', vfr);
    if (!franja) {
      const sug = sugerir(aTexto(vfr), opcionesDe('franja'));
      error('catalogo', 'franja', `«${aTexto(vfr)}» no es una franja válida.${sug ? ` ¿Quiso decir «${sug}»?` : ` Valores: ${opcionesDe('franja').join(', ')}.`}`, vfr);
    }
  }
  if (hora !== null) {
    const calculada = franjaDeHora(hora);
    if (franja && franja !== calculada) {
      aviso('consistencia', 'franja', `La hora ${String(hora).padStart(2, '0')}:00 corresponde a «${calculada}», pero la franja dice «${franja}». Se usa la franja del archivo.`, vfr);
    } else if (!franja) franja = calculada;
  }
  if (!franja && celdaVacia(vfr) && celdaVacia(vh) && horaDeFecha === undefined) {
    error('faltante', mapa.has('franja') ? 'franja' : 'hora', 'Falta la franja horaria (o la hora del siniestro).');
  }

  // --- Ubicación ---
  const provincia = catalogo('provincia') as Provincia | null;

  let canton = '';
  const vc = crudo('canton');
  if (celdaVacia(vc)) faltante('canton');
  else {
    canton = aTexto(vc, 80);
    if (provincia) {
      const oficial = resolverCanton(provincia, canton);
      if (oficial) canton = oficial;
      else aviso('catalogo', 'canton', `El cantón «${canton}» no está en el catálogo de referencia de ${provincia}. Se importa, pero no aparecerá en el filtro por cantón.`, vc);
    }
  }

  let distrito = 'No indicado';
  const vd = crudo('distrito');
  if (!celdaVacia(vd)) {
    distrito = aTexto(vd, 80);
    if (provincia && canton) {
      const oficial = resolverDistrito(provincia, canton, distrito);
      if (oficial) distrito = oficial;
      else if (resolverCanton(provincia, canton)) {
        aviso('catalogo', 'distrito', `El distrito «${distrito}» no está en el catálogo de referencia de ${canton}.`, vd);
      }
    }
  }

  let ruta: string | null = null;
  const vr = crudo('ruta');
  if (celdaVacia(vr)) faltante('ruta');
  else {
    const r = resolverRuta(vr);
    if (r.enCatalogo) ruta = r.texto;
    else error('catalogo', 'ruta', r.texto ? `«${r.texto}» no está en el catálogo de rutas del sistema.` : `«${aTexto(vr)}» no se reconoce como ruta nacional. Use «Ruta 27», «27» o «RN27».`, vr);
  }

  let kilometro: number | null = null;
  const vk = crudo('kilometro');
  if (celdaVacia(vk)) faltante('kilometro');
  else {
    kilometro = parsearNumero(vk);
    if (kilometro === null) error('tipo', 'kilometro', `«${aTexto(vk)}» no es un número.`, vk);
    else if (kilometro < 0 || kilometro > LIMITES.kmMax) {
      error('rango', 'kilometro', `El kilómetro ${kilometro} está fuera del rango permitido (0 a ${LIMITES.kmMax}).`, vk);
      kilometro = null;
    }
  }

  // --- Clasificación ---
  const vehiculo = catalogo('vehiculo');
  const severidad = catalogo('severidad');
  const clima = catalogo('clima');
  const calzada = catalogo('calzada');
  const genero = catalogo('genero');
  const condicion = catalogo('condicion');

  let edad: string | null = null;
  const ve = crudo('edad');
  if (celdaVacia(ve)) faltante('edad');
  else {
    const r = resolverEdad(ve);
    if (r.rango) edad = r.rango;
    else if (r.menorDeEdad) error('catalogo', 'edad', 'El sistema solo registra personas de 18 años o más (rangos 18-25, 26-40, 41-60, >60).', ve);
    else error('catalogo', 'edad', `«${aTexto(ve)}» no es un rango válido. Use 18-25, 26-40, 41-60, >60 o la edad en años.`, ve);
  }

  // --- Víctimas ---
  const conteo = (clave: string): number | null => {
    const v = crudo(clave);
    if (celdaVacia(v)) { faltante(clave); return null; }
    const n = parsearEntero(v);
    if (n === null) { error('tipo', clave, `«${aTexto(v)}» no es un número entero.`, v); return null; }
    if (n < 0 || n > LIMITES.conteoMax) { error('rango', clave, `${n} está fuera del rango permitido (0 a ${LIMITES.conteoMax}).`, v); return null; }
    if (n >= LIMITES.conteoAtipico) aviso('atipico', clave, `${n} es un valor poco común; verifique que no sea un error de digitación.`, v);
    return n;
  };
  const fallecidos = conteo('fallecidos');
  const heridosGraves = conteo('heridosGraves');
  const heridosLeves = conteo('heridosLeves');

  if (severidad && fallecidos !== null && heridosGraves !== null) {
    const esperada = fallecidos > 0 ? 'Fallecido' : heridosGraves > 0 ? 'Grave' : 'Leve';
    if (severidad !== esperada) {
      error('consistencia', 'severidad',
        `La severidad «${severidad}» no coincide con las víctimas (${fallecidos} fallecidos, ${heridosGraves} heridos graves): debería ser «${esperada}», porque la severidad es la mayor entre las víctimas.`,
        crudo('severidad'));
    }
  }

  // --- Entorno ---
  let senalizacion: boolean | null = null;
  const vs = crudo('senalizacion');
  if (celdaVacia(vs)) faltante('senalizacion');
  else {
    senalizacion = parsearBooleano(vs);
    if (senalizacion === null) error('tipo', 'senalizacion', `«${aTexto(vs)}» no es válido. Use Sí o No.`, vs);
  }

  let tiempo: number | null = null;
  const vt = crudo('tiempoRespuestaMin');
  if (celdaVacia(vt)) faltante('tiempoRespuestaMin');
  else {
    tiempo = parsearNumero(vt);
    if (tiempo === null) error('tipo', 'tiempoRespuestaMin', `«${aTexto(vt)}» no es un número de minutos.`, vt);
    else if (tiempo < 0 || tiempo > LIMITES.respuestaMax) {
      error('rango', 'tiempoRespuestaMin', `${tiempo} minutos está fuera del rango permitido (0 a ${LIMITES.respuestaMax}).`, vt);
      tiempo = null;
    } else if (tiempo > LIMITES.respuestaAtipica) {
      aviso('atipico', 'tiempoRespuestaMin', `${tiempo} minutos de respuesta es poco común; verifique el dato.`, vt);
    }
  }

  // --- Coordenadas (opcionales, pero si vienen deben ser válidas y venir en pareja) ---
  let latitud: number | undefined;
  let longitud: number | undefined;
  const vla = crudo('latitud');
  const vlo = crudo('longitud');
  const hayLat = !celdaVacia(vla);
  const hayLon = !celdaVacia(vlo);
  if (hayLat !== hayLon) {
    error('coordenadas', hayLat ? 'longitud' : 'latitud', 'Las coordenadas deben venir completas: falta ' + (hayLat ? 'la longitud.' : 'la latitud.'));
  } else if (hayLat && hayLon) {
    const la = parsearNumero(vla);
    const lo = parsearNumero(vlo);
    if (la === null || lo === null) {
      error('coordenadas', la === null ? 'latitud' : 'longitud', `«${aTexto(la === null ? vla : vlo)}» no es un número.`, la === null ? vla : vlo);
    } else if (la >= CAJA_CR.latMin && la <= CAJA_CR.latMax && lo >= CAJA_CR.lonMin && lo <= CAJA_CR.lonMax) {
      latitud = la;
      longitud = lo;
    } else if (lo >= CAJA_CR.latMin && lo <= CAJA_CR.latMax && la >= CAJA_CR.lonMin && la <= CAJA_CR.lonMax) {
      error('coordenadas', 'latitud', `La latitud y la longitud parecen estar invertidas (${la}, ${lo}). La latitud de Costa Rica va de ${CAJA_CR.latMin} a ${CAJA_CR.latMax}.`, `${la}, ${lo}`);
    } else {
      error('coordenadas', 'latitud', `Las coordenadas (${la}, ${lo}) quedan fuera de Costa Rica (latitud ${CAJA_CR.latMin} a ${CAJA_CR.latMax}, longitud ${CAJA_CR.lonMin} a ${CAJA_CR.lonMax}).`, `${la}, ${lo}`);
    }
  }

  // --- Día de la semana (opcional): se calcula con la fecha ---
  const vdia = crudo('diaSemana');
  if (!celdaVacia(vdia) && diaSemana) {
    const d = resolverCatalogo('diaSemana', vdia);
    if (!d) aviso('catalogo', 'diaSemana', `«${aTexto(vdia)}» no es un día válido; se usa el calculado con la fecha (${diaSemana}).`, vdia);
    else if (d !== diaSemana) aviso('consistencia', 'diaSemana', `El día informado (${d}) no coincide con la fecha, que cae ${diaSemana}. Se usa el calculado.`, vdia);
  }

  if (problemas.some((p) => p.gravedad === 'error')) return { problemas };

  const registro: RegistroNuevo = {
    fecha: fechaIso!, anio: anio as Anio, mes, diaSemana: diaSemana as Siniestro['diaSemana'],
    franja: franja as Siniestro['franja'], provincia: provincia!, canton, distrito, ruta: ruta as Siniestro['ruta'],
    kilometro: kilometro!, vehiculo: vehiculo as Siniestro['vehiculo'], severidad: severidad as Siniestro['severidad'],
    fallecidos: fallecidos!, heridosGraves: heridosGraves!, heridosLeves: heridosLeves!,
    clima: clima as Siniestro['clima'], calzada: calzada as Siniestro['calzada'], senalizacion: senalizacion!,
    edad: edad as Siniestro['edad'], genero: genero as Siniestro['genero'], condicion: condicion as Siniestro['condicion'],
    tiempoRespuestaMin: tiempo!,
    ...(latitud !== undefined && longitud !== undefined ? { latitud, longitud } : {}),
  };
  return { registro, problemas };
}

// ---------- Archivo completo ----------

const filaVacia = (f: FilaCruda): boolean => !f.errorEstructura && Object.values(f.valores).every(celdaVacia);

export function validarTabla(tabla: TablaCruda, opciones: OpcionesValidacion = {}): ResultadoIngesta {
  const hoy = opciones.hoy ?? new Date();
  const { estructura, mapa } = analizarEstructura(tabla.cabeceras);
  const conDatos = tabla.filas.filter((f) => !filaVacia(f));

  const resultado: ResultadoIngesta = {
    formato: tabla.formato,
    filasLeidas: conDatos.length,
    filasVacias: tabla.filas.length - conDatos.length,
    estructura,
    registros: [],
    importables: 0, conAdvertencias: 0, rechazados: 0, duplicadosArchivo: 0, duplicadosSistema: 0,
    problemas: [], totalProblemas: 0, problemasTruncados: false, porCodigo: {}, rechazadas: [],
    completitud: [], calidadPct: 0, puedeImportar: false,
  };

  // Falta una columna obligatoria: es un problema del archivo, no fila por fila
  if (estructura.faltantes.length > 0) {
    resultado.completitud = completitud(mapa, conDatos, new Map());
    return resultado;
  }

  const existentes = new Set((opciones.existentes ?? []).map((s) => claveDuplicado(s)));
  const vistas = new Map<string, number>(); // huella → fila donde apareció
  const presentes = new Map<string, number>();

  const registrar = (p: Problema) => {
    resultado.totalProblemas++;
    resultado.porCodigo[p.codigo] = (resultado.porCodigo[p.codigo] ?? 0) + 1;
    if (resultado.problemas.length < MAX_PROBLEMAS_GUARDADOS) resultado.problemas.push(p);
    else resultado.problemasTruncados = true;
  };

  for (const fila of conDatos) {
    for (const clave of mapa.keys()) {
      if (!celdaVacia(fila.valores[mapa.get(clave)!])) presentes.set(clave, (presentes.get(clave) ?? 0) + 1);
    }

    const { registro, problemas } = validarFila(fila, mapa, hoy);
    problemas.forEach(registrar);

    if (!registro) {
      resultado.rechazados++;
      if (resultado.rechazadas.length < MAX_PROBLEMAS_GUARDADOS) {
        resultado.rechazadas.push({
          fila: fila.numero,
          valores: fila.valores,
          motivos: problemas.filter((p) => p.gravedad === 'error').map((p) => (p.campo ? `${p.campo}: ${p.mensaje}` : p.mensaje)),
        });
      }
      continue;
    }

    const huella = claveDuplicado(registro);
    const previa = vistas.get(huella);
    if (previa !== undefined || existentes.has(huella)) {
      const enArchivo = previa !== undefined;
      if (enArchivo) resultado.duplicadosArchivo++;
      else resultado.duplicadosSistema++;
      registrar({
        fila: fila.numero, gravedad: 'advertencia', codigo: 'duplicado', campo: '',
        mensaje: enArchivo ? `Duplicado de la fila ${previa}: no se importa.` : 'Ya existe en los datos del sistema: no se importa.',
        valor: '',
      });
      continue;
    }
    vistas.set(huella, fila.numero);
    resultado.registros.push(registro);
    if (problemas.length > 0) resultado.conAdvertencias++;
  }

  resultado.importables = resultado.registros.length;
  resultado.calidadPct = resultado.filasLeidas ? (resultado.importables / resultado.filasLeidas) * 100 : 0;
  resultado.puedeImportar = resultado.importables > 0;
  resultado.completitud = completitud(mapa, conDatos, presentes);
  return resultado;
}

function completitud(
  mapa: ReadonlyMap<string, string>,
  filas: readonly FilaCruda[],
  presentes: ReadonlyMap<string, number>,
): CompletitudCampo[] {
  return CAMPOS.filter((c) => !c.ignorar && c.clave !== 'diaSemana').map((c) => {
    const enArchivo = mapa.has(c.clave);
    const n = presentes.get(c.clave) ?? 0;
    return {
      clave: c.clave, titulo: c.titulo, obligatorio: c.obligatorio || c.grupo === 'horario',
      enArchivo, presentes: n, total: filas.length,
      pct: enArchivo && filas.length ? (n / filas.length) * 100 : 0,
    };
  });
}
