import { RolUsuario } from '../models/auth.models';
import { TODOS_LOS_ROLES } from '../config/roles.config';
import { esHashValido } from './credenciales';
import {
  AlmacenUsuarios, CuentaPublica, CuentaUsuario, DatosFormularioUsuario, ErroresFormularioUsuario, FiltroCuentas,
} from './usuarios.models';

/*
 * Reglas de negocio de la gestión de cuentas (RF-9), SIN Angular ni navegador:
 * validar datos, proteger al último administrador, filtrar, resumir y limpiar lo que viene
 * del almacenamiento. La pantalla y el servicio solo llaman a estas funciones.
 */

export const LARGO_MIN_NOMBRE = 3;
export const LARGO_MAX_NOMBRE = 60;
export const LARGO_MAX_CORREO = 100;
export const LARGO_MIN_CLAVE = 8;
export const LARGO_MAX_CLAVE = 64;

// ---------- Normalizar ----------

/** Sin caracteres de control, espacios dobles ni espacios en los bordes */
export const normalizarNombre = (n: string): string =>
  n.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

export const normalizarCorreo = (c: string): string => c.trim().toLowerCase();

// ---------- Validar ----------

export function validarNombre(nombre: string): string | null {
  const n = normalizarNombre(nombre);
  if (!n) return 'El nombre es obligatorio.';
  if (n.length < LARGO_MIN_NOMBRE) return `El nombre debe tener al menos ${LARGO_MIN_NOMBRE} caracteres.`;
  if (n.length > LARGO_MAX_NOMBRE) return `El nombre no puede pasar de ${LARGO_MAX_NOMBRE} caracteres.`;
  if (!/\p{L}/u.test(n)) return 'El nombre debe incluir letras.';
  return null;
}

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `idExcluido`: la cuenta que se está editando, para que su propio correo no cuente como repetido */
export function validarCorreo(correo: string, cuentas: readonly Pick<CuentaPublica, 'id' | 'correo'>[], idExcluido?: number): string | null {
  const c = normalizarCorreo(correo);
  if (!c) return 'El correo es obligatorio.';
  if (c.length > LARGO_MAX_CORREO) return `El correo no puede pasar de ${LARGO_MAX_CORREO} caracteres.`;
  if (!FORMATO_CORREO.test(c)) return 'Escriba un correo válido, como nombre@institucion.go.cr.';
  if (cuentas.some((x) => x.id !== idExcluido && normalizarCorreo(x.correo) === c)) {
    return 'Ya existe una cuenta con ese correo.';
  }
  return null;
}

export interface RequisitoClave {
  id: 'largo' | 'mayuscula' | 'minuscula' | 'numero';
  texto: string;
  cumple: boolean;
}

/** La lista de condiciones que se muestra mientras se escribe la contraseña */
export function requisitosContrasena(clave: string): RequisitoClave[] {
  return [
    { id: 'largo', texto: `Al menos ${LARGO_MIN_CLAVE} caracteres`, cumple: clave.length >= LARGO_MIN_CLAVE },
    { id: 'mayuscula', texto: 'Una letra mayúscula', cumple: /\p{Lu}/u.test(clave) },
    { id: 'minuscula', texto: 'Una letra minúscula', cumple: /\p{Ll}/u.test(clave) },
    { id: 'numero', texto: 'Un número', cumple: /\d/.test(clave) },
  ];
}

export function validarContrasena(clave: string): string | null {
  if (!clave) return 'La contraseña es obligatoria.';
  if (clave.length > LARGO_MAX_CLAVE) return `La contraseña no puede pasar de ${LARGO_MAX_CLAVE} caracteres.`;
  if (requisitosContrasena(clave).some((r) => !r.cumple)) {
    return `Use al menos ${LARGO_MIN_CLAVE} caracteres, con mayúscula, minúscula y número.`;
  }
  return null;
}

export interface ContextoFormulario {
  cuentas: readonly Pick<CuentaPublica, 'id' | 'correo'>[];
  /** Cuenta que se edita; indefinido al crear */
  idEditando?: number;
}

/** Valida todo el formulario. Al editar, la contraseña vacía es válida (significa «dejar la actual»). */
export function validarFormulario(datos: DatosFormularioUsuario, ctx: ContextoFormulario): ErroresFormularioUsuario {
  const errores: ErroresFormularioUsuario = {};
  const nombre = validarNombre(datos.nombre);
  if (nombre) errores.nombre = nombre;
  const correo = validarCorreo(datos.correo, ctx.cuentas, ctx.idEditando);
  if (correo) errores.correo = correo;
  if (!TODOS_LOS_ROLES.includes(datos.rol)) errores.rol = 'Elija un rol.';
  const editando = ctx.idEditando !== undefined;
  if (!(editando && datos.contrasena === '')) {
    const clave = validarContrasena(datos.contrasena);
    if (clave) errores.contrasena = clave;
  }
  return errores;
}

export const hayErrores = (e: ErroresFormularioUsuario): boolean => Object.keys(e).length > 0;

// ---------- Contraseña temporal ----------

const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O (se confunden con 1 y 0)
const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz'; // sin l
const NUMEROS = '23456789'; // sin 0 ni 1

/**
 * Contraseña temporal fácil de dictar y que cumple la política. `azar(n)` entrega un entero en
 * [0, n): se inyecta para poder probarla; en la pantalla se usa un generador criptográfico.
 */
export function generarContrasena(azar: (max: number) => number, largo = 12): string {
  const todas = MAYUSCULAS + MINUSCULAS + NUMEROS;
  const elegir = (conjunto: string) => conjunto[azar(conjunto.length)];
  const caracteres = [elegir(MAYUSCULAS), elegir(MINUSCULAS), elegir(NUMEROS)];
  while (caracteres.length < Math.max(largo, LARGO_MIN_CLAVE)) caracteres.push(elegir(todas));
  for (let i = caracteres.length - 1; i > 0; i--) { // mezcla Fisher-Yates
    const j = azar(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}

// ---------- Proteger al último administrador ----------

type CuentaMinima = Pick<CuentaPublica, 'id' | 'rol' | 'activo'>;

export const administradoresActivos = <T extends CuentaMinima>(cuentas: readonly T[]): T[] =>
  cuentas.filter((c) => c.rol === 'ADMIN' && c.activo);

const SIN_ADMIN = 'Es la única persona administradora activa. El sistema debe conservar al menos una.';

/**
 * Las tres reglas devuelven el MOTIVO por el que la acción no se permite, o null si se puede.
 * `idActual` es la persona que está usando la pantalla.
 */
export function motivoNoDesactivar(id: number, cuentas: readonly CuentaMinima[], idActual: number | undefined): string | null {
  const cuenta = cuentas.find((c) => c.id === id);
  if (!cuenta || !cuenta.activo) return null; // desactivar a quien ya lo está no cambia nada
  if (id === idActual) return 'No puede desactivar su propia cuenta.';
  const despues = cuentas.map((c) => (c.id === id ? { ...c, activo: false } : c));
  return administradoresActivos(despues).length === 0 ? SIN_ADMIN : null;
}

export function motivoNoEliminar(id: number, cuentas: readonly CuentaMinima[], idActual: number | undefined): string | null {
  if (!cuentas.some((c) => c.id === id)) return null;
  if (id === idActual) return 'No puede eliminar su propia cuenta.';
  return administradoresActivos(cuentas.filter((c) => c.id !== id)).length === 0 ? SIN_ADMIN : null;
}

export function motivoNoCambiarRol(id: number, nuevoRol: RolUsuario, cuentas: readonly CuentaMinima[], idActual: number | undefined): string | null {
  const cuenta = cuentas.find((c) => c.id === id);
  if (!cuenta || cuenta.rol === nuevoRol) return null;
  if (id === idActual) return 'No puede cambiar su propio rol. Pídaselo a otra persona administradora.';
  const despues = cuentas.map((c) => (c.id === id ? { ...c, rol: nuevoRol } : c));
  return administradoresActivos(despues).length === 0 ? SIN_ADMIN : null;
}

// ---------- Buscar, ordenar, resumir ----------

/** Minúsculas y sin tildes: «jose» encuentra «José» */
const plano = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const FILTRO_CUENTAS_VACIO: FiltroCuentas = { texto: '', rol: '', estado: 'todos' };

export function filtrarCuentas<T extends CuentaPublica>(cuentas: readonly T[], f: FiltroCuentas): T[] {
  const buscado = plano(f.texto.trim());
  return cuentas.filter((c) => {
    if (f.rol && c.rol !== f.rol) return false;
    if (f.estado === 'activos' && !c.activo) return false;
    if (f.estado === 'desactivados' && c.activo) return false;
    return !buscado || plano(c.nombre).includes(buscado) || plano(c.correo).includes(buscado);
  });
}

export const ordenarCuentas = <T extends Pick<CuentaPublica, 'nombre'>>(cuentas: readonly T[]): T[] =>
  [...cuentas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

export interface ResumenCuentas {
  total: number;
  activas: number;
  desactivadas: number;
  /** Cuentas ACTIVAS de cada rol */
  activasPorRol: Record<RolUsuario, number>;
}

export function resumirCuentas(cuentas: readonly CuentaMinima[]): ResumenCuentas {
  const activasPorRol: Record<RolUsuario, number> = { ADMIN: 0, ANALISTA_TRANSITO: 0, CONSULTOR_PUBLICO: 0 };
  let activas = 0;
  for (const c of cuentas) {
    if (!c.activo) continue;
    activas++;
    activasPorRol[c.rol]++;
  }
  return { total: cuentas.length, activas, desactivadas: cuentas.length - activas, activasPorRol };
}

// ---------- Permisos por rol (sale del menú: una sola fuente de verdad) ----------

/** Forma mínima del menú (la misma de layout/menu.config.ts, sin importar la capa de vista) */
export interface MenuParaPermisos {
  titulo: string;
  items: readonly { ruta: string; etiqueta: string; roles: readonly RolUsuario[] }[];
}

export interface FilaPermiso {
  seccion: string;
  ruta: string;
  etiqueta: string;
  porRol: Record<RolUsuario, boolean>;
}

export function matrizPermisos(menu: readonly MenuParaPermisos[]): FilaPermiso[] {
  return menu.flatMap((s) =>
    s.items.map((i) => ({
      seccion: s.titulo,
      ruta: i.ruta,
      etiqueta: i.etiqueta,
      porRol: Object.fromEntries(TODOS_LOS_ROLES.map((r) => [r, i.roles.includes(r)])) as Record<RolUsuario, boolean>,
    })),
  );
}

// ---------- Datos del almacenamiento: nunca se confía en ellos ----------

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';

const fechaIso = (v: unknown): string | null => {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return null;
  return v;
};

/**
 * Convierte lo que haya guardado en un almacén válido: descarta cuentas mal formadas, con
 * rol desconocido, con hash inválido, ids repetidos o correos repetidos (gana la primera).
 */
export function sanitizarAlmacen(raw: unknown, ahoraIso: string): AlmacenUsuarios {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const ids = new Set<number>();
  const correos = new Set<string>();
  const cuentas: CuentaUsuario[] = [];

  for (const x of Array.isArray(r['cuentas']) ? r['cuentas'] : []) {
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
    const id = o['id'];
    const nombre = normalizarNombre(texto(o['nombre'], LARGO_MAX_NOMBRE));
    const correo = normalizarCorreo(texto(o['correo'], LARGO_MAX_CORREO));
    const rol = o['rol'];
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || ids.has(id)) continue;
    if (validarNombre(nombre) || !FORMATO_CORREO.test(correo) || correos.has(correo)) continue;
    if (typeof rol !== 'string' || !TODOS_LOS_ROLES.includes(rol as RolUsuario)) continue;
    if (!esHashValido(o['clave'])) continue;
    ids.add(id);
    correos.add(correo);
    cuentas.push({
      id, nombre, correo, rol: rol as RolUsuario,
      activo: o['activo'] === true,
      clave: o['clave'],
      creadoEn: fechaIso(o['creadoEn']) ?? ahoraIso,
      ultimoAcceso: fechaIso(o['ultimoAcceso']),
    });
  }

  const maxId = cuentas.reduce((m, c) => Math.max(m, c.id), 0);
  const proximo = typeof r['proximoId'] === 'number' && Number.isInteger(r['proximoId']) ? r['proximoId'] : 0;
  return { version: 1, proximoId: Math.max(proximo, maxId + 1), cuentas };
}

/**
 * Si no queda ninguna persona administradora activa (almacén dañado o manipulado), el sistema
 * quedaría sin nadie que pueda gestionar cuentas. Se devuelve el almacén con la cuenta de
 * demostración reactivada (o agregada); `restaurada` indica que hubo que hacerlo.
 */
export function garantizarAdministrador(
  almacen: AlmacenUsuarios,
  adminDemo: CuentaUsuario,
): { almacen: AlmacenUsuarios; restaurada: boolean } {
  if (administradoresActivos(almacen.cuentas).length > 0) return { almacen, restaurada: false };
  const sinChoque = almacen.cuentas.filter((c) => c.id !== adminDemo.id && c.correo !== adminDemo.correo);
  return {
    almacen: { ...almacen, proximoId: Math.max(almacen.proximoId, adminDemo.id + 1), cuentas: [adminDemo, ...sinChoque] },
    restaurada: true,
  };
}
