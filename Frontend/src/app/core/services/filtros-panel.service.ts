import { Injectable, computed, signal } from '@angular/core';
import {
  CampoFiltroPanel, FiltrosPanel, contarActivosPanel, filtrosPanelVacios,
} from '../models/filtros-panel';

/**
 * Estado de los filtros del panel de indicadores. Vive en un servicio (y no en el componente) para que el cálculo de
 * los indicadores y la exportación lean exactamente lo que la persona eligió.
 */
@Injectable({ providedIn: 'root' })
export class FiltrosPanelService {
  private readonly _filtros = signal<FiltrosPanel>(filtrosPanelVacios());

  readonly filtros = this._filtros.asReadonly();
  readonly activos = computed(() => contarActivosPanel(this._filtros()));

  /** Cambia un filtro. Al cambiar la provincia se reinician cantón y distrito; al cambiar el cantón, el distrito. */
  establecer(campo: CampoFiltroPanel, valor: string): void {
    this._filtros.update((f) => {
      const nuevo = { ...f, [campo]: valor };
      if (campo === 'provincia') {
        nuevo.canton = '';
        nuevo.distrito = '';
      }
      if (campo === 'canton') {
        nuevo.distrito = '';
      }
      return nuevo;
    });
  }

  /** Para los clics en los gráficos: elige el valor, o lo quita si ya estaba elegido. */
  alternar(campo: CampoFiltroPanel, valor: string): void {
    this.establecer(campo, this._filtros()[campo] === valor ? '' : valor);
  }

  limpiar(): void {
    this._filtros.set(filtrosPanelVacios());
  }
}
