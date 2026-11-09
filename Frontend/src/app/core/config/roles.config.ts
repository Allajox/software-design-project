import { RolUsuario } from '../models/auth.models';

/**
 * Conjuntos de roles reutilizables.
 * Son la ÚNICA fuente de verdad de permisos: el menú los usa para decidir
 * qué mostrar y las rutas los usan (roleGuard) para decidir quién puede entrar.
 */
export const TODOS_LOS_ROLES: RolUsuario[] = ['ADMIN', 'ANALISTA_TRANSITO', 'CONSULTOR_PUBLICO'];
export const ROLES_ANALISIS: RolUsuario[] = ['ADMIN', 'ANALISTA_TRANSITO'];
export const SOLO_ADMIN: RolUsuario[] = ['ADMIN'];
