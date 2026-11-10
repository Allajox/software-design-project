import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Escenario, Estimacion, MIN_SINIESTROS_MODELO, NivelRiesgoVial, SOPORTE_MINIMO, TEXTO_NIVEL_VIAL, UMBRALES_INDICE,
  Comparacion, curvaPorFactor, estimacionesATabla, estimar, estimarTodas, franjaDeFecha, interpretarAuc,
  leerEstimacion, redactarEstimacion,
} from '../../core/analisis/riesgo';
import { CALZADAS, CLIMAS, Clima, EstadoCalzada, FRANJAS, FranjaHoraria } from '../../core/models/catalogos';
import { AvisosService } from '../../core/services/avisos.service';
import { aCsv, nombreArchivo } from '../../core/services/exportacion';
import { RiesgoService } from '../../core/services/riesgo.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { OpcionesUnicaComponent } from '../../shared/ui/opciones-unica.component';
import { descargar } from '../../shared/utils/descarga';
import { escalaNice } from '../../shared/utils/escala';
import { fmtDec1, fmtDec2, fmtEntero, fmtPct } from '../../shared/utils/formato';
import { TablaDatosComponent } from '../dashboard/graficos/tabla-datos.component';
import { TarjetaGraficoComponent } from '../dashboard/graficos/tarjeta-grafico.component';
import { GraficoDispersionComponent } from './graficos/grafico-dispersion.component';
import { GraficoFactorComponent } from './graficos/grafico-factor.component';

/** Color y forma de cada nivel. Nunca va solo el color: siempre con la forma y el nombre */
export const ESTILO_NIVEL_VIAL: Record<NivelRiesgoVial, { fondo: string; texto: string; forma: string }> = {
  'bajo': { fondo: '#2e7d32', texto: '#ffffff', forma: '✓' },
  'moderado': { fondo: '#f2c94c', texto: '#2a2100', forma: '●' },
  'alto': { fondo: '#f28c28', texto: '#1f1300', forma: '◆' },
  'muy-alto': { fondo: '#b3261e', texto: '#ffffff', forma: '▲' },
};

const TEXTO_COMPARACION: Record<Comparacion, string> = {
  mayor: '↑ por encima del promedio',
  similar: '≈ no se distingue del promedio',
  menor: '↓ por debajo del promedio',
};

type GrupoExposicion = 'clima' | 'calzada';

/**
 * Predicción de riesgo (RF-7). La estadística vive en `core/analisis/riesgo.ts` y el modelo en `RiesgoService`;
 * esta pantalla solo guarda el escenario que la persona eligió y lo dibuja.
 */
@Component({
  selector: 'app-riesgo',
  imports: [
    RouterLink, IconComponent, OpcionesUnicaComponent, TarjetaGraficoComponent, TablaDatosComponent,
    GraficoFactorComponent, GraficoDispersionComponent,
  ],
  templateUrl: './riesgo.component.html',
  styleUrl: './riesgo.component.scss',
})
export class RiesgoComponent {
  protected readonly riesgo = inject(RiesgoService);
  private readonly avisos = inject(AvisosService);

  protected readonly climas = CLIMAS;
  protected readonly calzadas = CALZADAS;
  protected readonly franjas = FRANJAS;
  protected readonly estiloNivel = ESTILO_NIVEL_VIAL;
  protected readonly textoNivel = TEXTO_NIVEL_VIAL;
  protected readonly textoComparacion = TEXTO_COMPARACION;
  protected readonly umbrales = UMBRALES_INDICE;
  protected readonly soporteMinimo = SOPORTE_MINIMO;
  protected readonly minimoModelo = MIN_SINIESTROS_MODELO;
  protected readonly fmtDec1 = fmtDec1;
  protected readonly fmtDec2 = fmtDec2;
  protected readonly fmtEntero = fmtEntero;
  protected readonly fmtPct = fmtPct;

  /** Punto de partida neutro: condiciones normales y la franja en la que se abre la pantalla */
  protected readonly escenario = signal<Escenario>({ clima: 'Buen tiempo', calzada: 'Buena', franja: franjaDeFecha(new Date()) });

  protected readonly modelo = this.riesgo.modelo;
  protected readonly pocosDatos = computed(() => (this.modelo()?.entrenadoCon ?? 0) < MIN_SINIESTROS_MODELO);

  protected readonly estimacion = computed<Estimacion | null>(() => {
    const m = this.modelo();
    return m ? estimar(m, this.escenario()) : null;
  });
  protected readonly lectura = computed(() => {
    const m = this.modelo();
    const e = this.estimacion();
    return m && e ? leerEstimacion(m, e) : null;
  });
  protected readonly frase = computed(() => {
    const m = this.modelo();
    const e = this.estimacion();
    return m && e ? redactarEstimacion(m, e) : '';
  });

  protected readonly curvas = computed(() => {
    const m = this.modelo();
    if (!m) return null;
    const esc = this.escenario();
    return {
      clima: curvaPorFactor(m, esc, 'clima'),
      calzada: curvaPorFactor(m, esc, 'calzada'),
      franja: curvaPorFactor(m, esc, 'franja'),
    };
  });
  /** Misma escala para los tres factores: así una barra se puede comparar con la de otro factor */
  protected readonly escalaIndice = computed(() => {
    const c = this.curvas();
    if (!c) return escalaNice(0, 2);
    const todos = [...c.clima, ...c.calzada, ...c.franja].map((e) => e.indice);
    return escalaNice(0, Math.max(1.2, ...todos), 4);
  });
  protected readonly todas = computed(() => {
    const m = this.modelo();
    return m ? estimarTodas(m) : [];
  });

  protected readonly tablaCurvas = computed(() => {
    const c = this.curvas();
    if (!c) return [];
    const filas = (factor: string, lista: readonly Estimacion[], clave: 'clima' | 'calzada' | 'franja') =>
      lista.map((e) => [
        factor, e.escenario[clave], `${fmtDec1(e.indice)}×`, `${fmtDec2(e.frecuencia)}×`, fmtPct(e.pGrave * 100),
        fmtEntero(e.soporte),
      ]);
    return [...filas('Clima', c.clima, 'clima'), ...filas('Calzada', c.calzada, 'calzada'), ...filas('Franja', c.franja, 'franja')];
  });

  protected readonly interpretacionAuc = computed(() => {
    const c = this.modelo()?.calidad;
    return c ? interpretarAuc(c.auc) : null;
  });

  // ----- Exposición (supuesto editable) -----
  protected readonly sumaClima = computed(() => this.suma(Object.values(this.riesgo.exposicion().clima)));
  protected readonly sumaCalzada = computed(() => this.suma(Object.values(this.riesgo.exposicion().calzada)));
  protected readonly sumaFranja = computed(() => this.suma(Object.values(this.riesgo.exposicion().franja)));
  private suma(v: readonly number[]): number {
    return Math.round(v.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) * 100) / 100;
  }

  // ----- Acciones -----
  protected elegirClima(c: string): void {
    this.escenario.update((e) => ({ ...e, clima: c as Clima }));
  }
  protected elegirCalzada(c: string): void {
    this.escenario.update((e) => ({ ...e, calzada: c as EstadoCalzada }));
  }
  protected elegirFranja(f: string): void {
    this.escenario.update((e) => ({ ...e, franja: f as FranjaHoraria }));
  }
  protected elegirEscenario(e: Escenario): void {
    this.escenario.set({ ...e });
  }
  protected elegirNivel(factor: 'clima' | 'calzada' | 'franja', valor: string): void {
    this.escenario.update((e) => ({ ...e, [factor]: valor }) as Escenario);
  }

  protected usarHoraActual(): void {
    const ahora = new Date();
    const franja = franjaDeFecha(ahora);
    this.escenario.update((e) => ({ ...e, franja }));
    const hora = ahora.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    this.avisos.info(`Son las ${hora}: franja «${franja}».`);
  }

  protected cambiarExposicion(grupo: GrupoExposicion, nivel: string, ev: Event): void {
    const campo = ev.target as HTMLInputElement;
    const n = Number(campo.value.replace(',', '.'));
    const actual = (this.riesgo.exposicion()[grupo] as Record<string, number>)[nivel];
    if (campo.value.trim() === '' || !Number.isFinite(n) || n < 0) {
      campo.value = String(actual);
      this.avisos.error('Escriba un porcentaje entre 0 y 100.');
      return;
    }
    const valor = Math.min(100, n);
    campo.value = String(valor);
    if (grupo === 'clima') this.riesgo.establecerClima(nivel as Clima, valor);
    else this.riesgo.establecerCalzada(nivel as EstadoCalzada, valor);
  }

  protected restablecerExposicion(): void {
    this.riesgo.restablecerExposicion();
    this.avisos.info('Se volvió a los supuestos de exposición originales.');
  }

  protected exportar(): void {
    const blob = new Blob(['﻿', aCsv(estimacionesATabla(this.todas()))], { type: 'text/csv;charset=utf-8' });
    descargar(blob, nombreArchivo('sivcr-riesgo', 'csv'));
  }
}
