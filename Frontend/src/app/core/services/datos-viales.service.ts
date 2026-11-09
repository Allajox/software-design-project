import { Injectable, computed, signal } from '@angular/core';
import { generarSiniestros } from '../data/generador-siniestros';
import { Siniestro, SiniestroNuevo } from '../models/siniestro.models';

/** De dónde vienen los datos que se están viendo */
export interface OrigenDatos {
  tipo: 'ejemplo' | 'archivo';
  /** Nombre del último archivo cargado (solo si tipo = 'archivo') */
  archivo?: string;
  /** Cuántos archivos se han sumado desde que se dejaron los datos de ejemplo */
  archivos: number;
}

const ORIGEN_EJEMPLO: OrigenDatos = { tipo: 'ejemplo', archivos: 0 };

/**
 * Capa de DATOS: única puerta de entrada a los siniestros.
 * Hoy parte de datos de ejemplo y permite sumar o reemplazar con archivos cargados (RF-1) en
 * la memoria del navegador. Cuando exista el backend solo cambia esta clase: el resto de la
 * aplicación sigue leyendo `siniestros()` sin enterarse.
 */
@Injectable({ providedIn: 'root' })
export class DatosVialesService {
  private readonly _siniestros = signal<readonly Siniestro[]>(generarSiniestros());
  private readonly _origen = signal<OrigenDatos>(ORIGEN_EJEMPLO);

  readonly siniestros = this._siniestros.asReadonly();
  readonly total = computed(() => this._siniestros().length);
  readonly origen = this._origen.asReadonly();
  readonly esEjemplo = computed(() => this._origen().tipo === 'ejemplo');

  /**
   * Suma registros nuevos a los que ya hay. Los ID se asignan aquí, siguiendo al mayor existente.
   * Si los datos eran de ejemplo, se conservan (la persona decide si prefiere reemplazarlos).
   * @returns cuántos registros se agregaron
   */
  agregar(nuevos: readonly SiniestroNuevo[], archivo: string): number {
    const actuales = this._siniestros();
    const primerId = actuales.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    this._siniestros.set([...actuales, ...nuevos.map((s, i): Siniestro => ({ ...s, id: primerId + i }))]);
    this._origen.update((o) => ({ tipo: 'archivo', archivo, archivos: o.archivos + 1 }));
    return nuevos.length;
  }

  /** Descarta todo lo que había y deja solo los registros nuevos (ID desde 1) */
  reemplazar(nuevos: readonly SiniestroNuevo[], archivo: string): number {
    this._siniestros.set(nuevos.map((s, i): Siniestro => ({ ...s, id: i + 1 })));
    this._origen.set({ tipo: 'archivo', archivo, archivos: 1 });
    return nuevos.length;
  }

  restaurarEjemplo(): void {
    this._siniestros.set(generarSiniestros());
    this._origen.set(ORIGEN_EJEMPLO);
  }
}
