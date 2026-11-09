import { Injectable, computed, inject, signal } from '@angular/core';
import {
  EXPOSICION_POR_DEFECTO, Exposicion, copiarExposicion, entrenarModelo, esExposicionPorDefecto,
} from '../analisis/riesgo';
import { Clima, EstadoCalzada } from '../models/catalogos';
import { DatosVialesService } from './datos-viales.service';

/**
 * Capa de NEGOCIO del riesgo: entrena el modelo con los siniestros cargados y con la exposición
 * que supone la persona. Es un servicio (y no vive en la pantalla) porque el simulador What-If
 * (RF-8) usa el mismo modelo; así las dos pantallas siempre coinciden.
 *
 * Al cargar datos nuevos (RF-1) o cambiar la exposición, `modelo` se recalcula solo.
 */
@Injectable({ providedIn: 'root' })
export class RiesgoService {
  private readonly datos = inject(DatosVialesService);

  /** Supuesto editable: % del tiempo que se da cada condición */
  readonly exposicion = signal<Exposicion>(copiarExposicion(EXPOSICION_POR_DEFECTO));
  readonly exposicionPorDefecto = computed(() => esExposicionPorDefecto(this.exposicion()));

  readonly modelo = computed(() => entrenarModelo(this.datos.siniestros(), this.exposicion()));

  establecerClima(clima: Clima, porcentaje: number): void {
    this.exposicion.update((e) => ({ ...e, clima: { ...e.clima, [clima]: porcentaje } }));
  }

  establecerCalzada(calzada: EstadoCalzada, porcentaje: number): void {
    this.exposicion.update((e) => ({ ...e, calzada: { ...e.calzada, [calzada]: porcentaje } }));
  }

  restablecerExposicion(): void {
    this.exposicion.set(copiarExposicion(EXPOSICION_POR_DEFECTO));
  }
}
