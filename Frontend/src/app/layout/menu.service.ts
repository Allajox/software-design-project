import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../core/services/auth.service';
import { MENU } from './menu.config';
import { SeccionMenu, UbicacionActual } from './menu.models';

/**
 * Decide qué ve cada rol en el menú. No sabe nada de la vista (HTML/CSS):
 * solo entrega datos, igual que AuthService.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly auth = inject(AuthService);

  /** Secciones con solo los ítems permitidos para el rol actual (las vacías se omiten). */
  readonly secciones = computed<SeccionMenu[]>(() => {
    const rol = this.auth.usuario()?.rol;
    if (!rol) return [];

    return MENU
      .map((seccion) => ({ ...seccion, items: seccion.items.filter((i) => i.roles.includes(rol)) }))
      .filter((seccion) => seccion.items.length > 0);
  });

  /** Devuelve sección y nombre de la pantalla que corresponde a una URL (para las migas). */
  ubicacion(url: string): UbicacionActual | null {
    const ruta = url.split(/[?#]/)[0].replace(/^\//, '');

    for (const seccion of MENU) {
      for (const item of seccion.items) {
        if (ruta === item.ruta || ruta.startsWith(item.ruta + '/')) {
          return { seccion: seccion.titulo, etiqueta: item.etiqueta };
        }
      }
    }
    return null;
  }
}
