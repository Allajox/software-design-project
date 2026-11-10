import { Injectable, computed, signal } from '@angular/core';
import { FiltrosApi, contarFiltrosActivos, filtrosApiVacios } from './filtros-api';

/**
 * Filtros APLICADOS en la pantalla de registros conectada al servidor. Vive aquí (y no en el componente) para que el
 * historial pueda dejar una consulta lista y la pantalla de registros la encuentre al abrirse.
 */
@Injectable({ providedIn: 'root' })
export class FiltrosApiService {
  private readonly _filtros = signal<FiltrosApi>(filtrosApiVacios());
  readonly filtros = this._filtros.asReadonly();
  readonly activos = computed(() => contarFiltrosActivos(this._filtros()));

  reemplazar(f: FiltrosApi): void {
    this._filtros.set({ ...f });
  }

  limpiar(): void {
    this._filtros.set(filtrosApiVacios());
  }
}
