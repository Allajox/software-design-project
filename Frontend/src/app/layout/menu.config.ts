import { ROLES_ANALISIS, SOLO_ADMIN, TODOS_LOS_ROLES } from '../core/config/roles.config';
import { SeccionMenu } from './menu.models';

/**
 * Definición del menú lateral. Para agregar una pantalla nueva:
 *   1) agrega aquí el ítem, 2) agrega su ruta en app.routes.ts con el mismo conjunto de roles.
 */
export const MENU: SeccionMenu[] = [
  {
    titulo: 'Análisis',
    items: [
      { ruta: 'dashboard', etiqueta: 'Dashboard', icono: 'dashboard', roles: TODOS_LOS_ROLES, fase: 1 },
      { ruta: 'registros', etiqueta: 'Explorador de registros', icono: 'tabla', roles: TODOS_LOS_ROLES, fase: 1 },
      { ruta: 'historial', etiqueta: 'Historial de consultas', icono: 'historial', roles: ROLES_ANALISIS, fase: 1 },
    ],
  },
  {
    titulo: 'Datos',
    items: [
      { ruta: 'ingesta', etiqueta: 'Carga de datos', icono: 'subir', roles: ROLES_ANALISIS, fase: 1 },
    ],
  },
  {
    titulo: 'Predicción',
    items: [
      { ruta: 'hotspots', etiqueta: 'Hotspots de riesgo', icono: 'mapa', roles: ROLES_ANALISIS, fase: 2 },
      { ruta: 'riesgo', etiqueta: 'Predicción de riesgo', icono: 'riesgo', roles: ROLES_ANALISIS, fase: 2 },
      { ruta: 'simulador', etiqueta: 'Simulador What-If', icono: 'simulador', roles: ROLES_ANALISIS, fase: 2 },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: 'usuarios', etiqueta: 'Usuarios y roles', icono: 'usuarios', roles: SOLO_ADMIN, fase: 2 },
    ],
  },
];
