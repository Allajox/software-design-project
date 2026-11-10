import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';
import { API_CONFIG } from '../config/api.config';

/** Lo que devuelve GET /api/dashboard/opciones (OpcionesPanel en el backend) */
export interface OpcionesPanelApi {
  provincias: string[];
  /** provincia → cantones que tienen siniestros */
  cantones: Record<string, string[]>;
  /** cantón → distritos que tienen siniestros */
  distritos: Record<string, string[]>;
  /** «Ruta 1», «Ruta 2», … en orden numérico */
  rutas: string[];
  anios: number[];
  vehiculos: string[];
}

const SIN_OPCIONES: OpcionesPanelApi = {
  provincias: [], cantones: {}, distritos: {}, rutas: [], anios: [], vehiculos: [],
};

/**
 * Valores reales con los que se llenan las listas del panel de filtros (cantones, distritos, rutas, años y vehículos
 * que existen en la base de datos). Se piden una vez; no dependen de los filtros elegidos.
 */
@Injectable({ providedIn: 'root' })
export class OpcionesPanelService {
  private readonly recurso = httpResource<OpcionesPanelApi>(() => `${API_CONFIG.baseUrl}/dashboard/opciones`);

  readonly datos = computed(() => (this.recurso.hasValue() ? this.recurso.value() : SIN_OPCIONES));
  readonly cargando = this.recurso.isLoading;
  readonly error = this.recurso.error;

  /** Cantones de la provincia; sin provincia elegida, todos en orden alfabético. */
  cantones(provincia: string): string[] {
    const porProvincia = this.datos().cantones;
    if (provincia) return porProvincia[provincia] ?? [];
    return Object.values(porProvincia)
      .flat()
      .sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** Distritos del cantón (vacío si no hay cantón elegido). */
  distritos(canton: string): string[] {
    return canton ? (this.datos().distritos[canton] ?? []) : [];
  }

  /** Provincia a la que pertenece un cantón ('' si no se conoce). */
  provinciaDe(canton: string): string {
    const encontrada = Object.entries(this.datos().cantones).find(([, lista]) => lista.includes(canton));
    return encontrada?.[0] ?? '';
  }

  reintentar(): void {
    this.recurso.reload();
  }
}
