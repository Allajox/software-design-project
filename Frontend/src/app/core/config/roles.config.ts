import { RolUsuario } from '../models/auth.models';
import { API_CONFIG } from './api.config';

/**
 * Conjuntos de roles reutilizables.
 * Son la ÚNICA fuente de verdad de permisos: el menú los usa para decidir
 * qué mostrar y las rutas los usan (roleGuard) para decidir quién puede entrar.
 */
export const TODOS_LOS_ROLES: RolUsuario[] = ['ADMIN', 'ANALISTA_TRANSITO', 'CONSULTOR_PUBLICO'];
export const ROLES_ANALISIS: RolUsuario[] = ['ADMIN', 'ANALISTA_TRANSITO'];
export const SOLO_ADMIN: RolUsuario[] = ['ADMIN'];

/**
 * Con el servidor conectado (API_CONFIG.datosReales) rigen los permisos del backend, que ya los exige en cada petición:
 * /records y /queries: ADMIN y ANALISTA; /ingestion: solo ADMIN. En modo demostración se conservan los de siempre.
 */
/**
 * Con el servidor conectado, el dashboard (/api/dashboard) lo exigen ADMIN y ANALISTA; el consultor público solo ve la
 * vista pública (/publico), que es la única parte del panel sin filtros ni datos de personas.
 */
export const ROLES_DASHBOARD: RolUsuario[] = API_CONFIG.datosReales ? ROLES_ANALISIS : TODOS_LOS_ROLES;
export const ROLES_REGISTROS: RolUsuario[] = API_CONFIG.datosReales ? ROLES_ANALISIS : TODOS_LOS_ROLES;
export const ROLES_INGESTA: RolUsuario[] = API_CONFIG.datosReales ? SOLO_ADMIN : ROLES_ANALISIS;

/** Adónde llega cada rol al iniciar sesión: a su dashboard, o a la vista pública si su rol no tiene dashboard. */
export function rutaInicial(rol: RolUsuario | undefined): string {
  return rol && ROLES_DASHBOARD.includes(rol) ? '/dashboard' : '/publico';
}
