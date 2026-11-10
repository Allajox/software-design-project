import { RolUsuario } from '../core/models/auth.models';
import { IconoNombre } from '../shared/icon/icon.component';

export interface ItemMenu {
  /** Ruta sin barra inicial, p. ej. 'dashboard' */
  ruta: string;
  etiqueta: string;
  icono: IconoNombre;
  /** Roles que pueden ver y abrir esta opción */
  roles: RolUsuario[];
  /** Fase del proyecto a la que pertenece la pantalla (según el documento del SIVCR). Solo documenta: no se muestra */
  fase: 1 | 2;
  /** true = la pantalla todavía usa datos de demostración (no está conectada al servidor); se marca en el menú */
  demo?: boolean;
}

export interface SeccionMenu {
  titulo: string;
  items: ItemMenu[];
}

export interface UbicacionActual {
  seccion: string;
  etiqueta: string;
  demo: boolean;
}
