import { API_CONFIG } from '../core/config/api.config';
import { ROLES_ANALISIS, ROLES_DASHBOARD, ROLES_INGESTA, ROLES_REGISTROS, SOLO_ADMIN } from '../core/config/roles.config';
import { SeccionMenu } from './menu.models';

/** Con el servidor conectado, las pantallas que aún no tienen endpoint se marcan «Demo» en el menú */
const DEMO = API_CONFIG.datosReales;

/**
 * Definición del menú lateral. Para agregar una pantalla nueva:
 *   1) agrega aquí el ítem, 2) agrega su ruta en app.routes.ts con el mismo conjunto de roles.
 */
export const MENU: SeccionMenu[] = [
  {
    titulo: 'Análisis',
    items: [
      { ruta: 'dashboard', etiqueta: 'Dashboard', icono: 'dashboard', roles: ROLES_DASHBOARD, fase: 1 },
      { ruta: 'registros', etiqueta: 'Explorador de registros', icono: 'tabla', roles: ROLES_REGISTROS, fase: 1 },
      { ruta: 'historial', etiqueta: 'Historial de consultas', icono: 'historial', roles: ROLES_ANALISIS, fase: 1 },
    ],
  },
  {
    titulo: 'Datos',
    items: [
      { ruta: 'ingesta', etiqueta: 'Carga de datos', icono: 'subir', roles: ROLES_INGESTA, fase: 1 },
    ],
  },
  {
    titulo: 'Predicción',
    items: [
      { ruta: 'hotspots', etiqueta: 'Hotspots de riesgo', icono: 'mapa', roles: ROLES_ANALISIS, fase: 2, demo: DEMO },
      { ruta: 'riesgo', etiqueta: 'Predicción de riesgo', icono: 'riesgo', roles: ROLES_ANALISIS, fase: 2, demo: DEMO },
      { ruta: 'simulador', etiqueta: 'Simulador What-If', icono: 'simulador', roles: ROLES_ANALISIS, fase: 2, demo: DEMO },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      // Con el servidor es «Usuarios y Configuración» (cuentas + pesos del ISS); con la demostración, solo las cuentas simuladas
      {
        ruta: 'usuarios',
        etiqueta: API_CONFIG.useMock ? 'Usuarios y roles' : 'Usuarios y Configuración',
        icono: 'usuarios',
        roles: SOLO_ADMIN,
        fase: 2,
        demo: API_CONFIG.useMock,
      },
    ],
  },
];
