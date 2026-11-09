import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TEXTO_NIVEL, detectarHotspots, etiquetaTramo, ordenarHotspots } from '../../core/analisis/hotspots';
import {
  ALCANCE_NACIONAL, Alcance, Efecto, MEDIDAS_POR_DEFECTO, Medidas, copiarMedidas, describirAlcance, detectabilidad,
  esAlcanceNacional, fijarEfecto, porAnio, simulacionATabla, simular, sonMedidasPorDefecto,
} from '../../core/analisis/simulacion';
import { FRANJAS, FranjaHoraria, PROVINCIAS, RUTAS } from '../../core/models/catalogos';
import { AvisosService } from '../../core/services/avisos.service';
import { DatosVialesService } from '../../core/services/datos-viales.service';

import { aCsv, nombreArchivo } from '../../core/services/exportacion';
import { IconComponent } from '../../shared/icon/icon.component';
import { ChipsFiltroComponent, OpcionChip } from '../../shared/ui/chips-filtro.component';
import { descargar } from '../../shared/utils/descarga';
import { fmtDec1, fmtDec2, fmtEntero, fmtPct } from '../../shared/utils/formato';
import { TablaDatosComponent } from '../dashboard/graficos/tabla-datos.component';
import { TarjetaGraficoComponent } from '../dashboard/graficos/tarjeta-grafico.component';
import { TarjetaKpiComponent } from '../dashboard/tarjeta-kpi.component';
import { FilaAntesDespues, GraficoAntesDespuesComponent } from './graficos/grafico-antes-despues.component';

type NombreMedida = 'senalizacion' | 'patrullaje';
const HOTSPOTS_OFRECIDOS = 15;

/** Con menos siniestros que esto en el alcance, las cifras por año son muy inestables */
const MIN_SINIESTROS_ALCANCE = 30;

/** 0,04 → «0,04»; 12,3 → «12,3» (con cifras chicas hace falta otro decimal para no mostrar «0,0») */
export const cifra = (n: number): string => (n < 1 ? fmtDec2(n) : fmtDec1(n));

/**
 * Simulador What-If (RF-8). La proyección vive en `core/analisis/simulacion.ts` (funciones puras).
 * Esta pantalla guarda el alcance y los supuestos que elige la persona, y muestra el resultado.
 */
@Component({
  selector: 'app-simulador',
  imports: [
    RouterLink, IconComponent, ChipsFiltroComponent, TarjetaKpiComponent, TarjetaGraficoComponent, TablaDatosComponent,
    GraficoAntesDespuesComponent,
  ],
  templateUrl: './simulador.component.html',
  styleUrl: './simulador.component.scss',
})
export class SimuladorComponent {
  private readonly datos = inject(DatosVialesService);
  private readonly avisos = inject(AvisosService);

  protected readonly provincias = PROVINCIAS;
  protected readonly rutas = RUTAS;
  protected readonly textoNivelHotspot = TEXTO_NIVEL;
  protected readonly etiquetaTramo = etiquetaTramo;
  protected readonly minSiniestros = MIN_SINIESTROS_ALCANCE;
  protected readonly fmtDec1 = fmtDec1;
  protected readonly fmtDec2 = fmtDec2;
  protected readonly fmtEntero = fmtEntero;
  protected readonly fmtPct = fmtPct;
  protected readonly cifra = cifra;

  protected readonly alcance = signal<Alcance>({ ...ALCANCE_NACIONAL });
  protected readonly medidas = signal<Medidas>(copiarMedidas(MEDIDAS_POR_DEFECTO));

  protected readonly totalCargados = computed(() => this.datos.siniestros().length);
  protected readonly medidasPorDefecto = computed(() => sonMedidasPorDefecto(this.medidas()));
  protected readonly esNacional = computed(() => esAlcanceNacional(this.alcance()));
  protected readonly descripcionAlcance = computed(() => describirAlcance(this.alcance()));
  protected readonly alcanceModificado = computed(() => !this.esNacional() || this.alcance().kmDesde !== null || this.alcance().kmHasta !== null);

  protected readonly resultado = computed(() => simular(this.datos.siniestros(), this.alcance(), this.medidas()));

  /** Los tramos críticos que detectó RF-6, para elegir uno como alcance con un clic */
  protected readonly tramosCriticos = computed(() =>
    ordenarHotspots(detectarHotspots(this.datos.siniestros()).hotspots, 'severidad').slice(0, HOTSPOTS_OFRECIDOS),
  );

  protected readonly opcionesFranja = computed<OpcionChip<FranjaHoraria>[]>(() => {
    const porFranja = this.resultado()?.cobertura.porFranjaPct;
    return FRANJAS.map((f) => ({ valor: f, texto: porFranja ? `${f} · ${fmtDec1(porFranja[f])} %` : f, descripcion: porFranja ? `${f}: ${fmtDec1(porFranja[f])} % de los siniestros del alcance` : f }));
  });

  protected readonly ninguna = computed(() => !this.medidas().senalizacion.activa && !this.medidas().patrullaje.activa);

  /** Lo que aparece en pantalla, ya convertido a «por año» */
  protected readonly vista = computed(() => {
    const r = this.resultado();
    if (!r) return null;
    const a = r.anios;
    const c = r.impacto.central;
    const lo = r.impacto.minimo;
    const hi = r.impacto.maximo;
    const filas: FilaAntesDespues[] = [
      { nombre: 'Siniestros', hoy: r.base.siniestrosAnio, despues: r.base.siniestrosAnio - porAnio(c.siniestrosEvitados, a), despuesMin: r.base.siniestrosAnio - porAnio(hi.siniestrosEvitados, a), despuesMax: r.base.siniestrosAnio - porAnio(lo.siniestrosEvitados, a) },
      { nombre: 'Heridos graves', hoy: r.base.gravesAnio, despues: r.base.gravesAnio - porAnio(c.gravesEvitados, a), despuesMin: r.base.gravesAnio - porAnio(hi.gravesEvitados, a), despuesMax: r.base.gravesAnio - porAnio(lo.gravesEvitados, a) },
      { nombre: 'Fallecidos', hoy: r.base.fallecidosAnio, despues: r.base.fallecidosAnio - porAnio(c.fallecidosEvitados, a), despuesMin: r.base.fallecidosAnio - porAnio(hi.fallecidosEvitados, a), despuesMax: r.base.fallecidosAnio - porAnio(lo.fallecidosEvitados, a) },
    ];
    const evitadosAnio = porAnio(c.siniestrosEvitados, a);
    const deteccion = detectabilidad(evitadosAnio, r.ruidoAnual);
    const desglose = (nombre: string, i: typeof c | null, alcanza: number): string[] | null =>
      i ? [nombre, cifra(porAnio(i.siniestrosEvitados, a)), cifra(porAnio(i.fallecidosEvitados, a)), `${fmtDec1(alcanza)} %`] : null;
    const m = this.medidas();
    const filasDesglose = [
      desglose('Solo señalización', r.porMedida.senalizacion, r.cobertura.sinSenalizacionPct * (m.senalizacion.cobertura / 100)),
      desglose('Solo patrullaje', r.porMedida.patrullaje, r.cobertura.enFranjasPct),
      m.senalizacion.activa && m.patrullaje.activa ? desglose('Ambas juntas', c, r.cobertura.alcanzadosPct) : null,
    ].filter((f): f is string[] => f !== null);
    return {
      r, filas, deteccion, evitadosAnio, filasDesglose,
      evitadosMin: porAnio(lo.siniestrosEvitados, a),
      evitadosMax: porAnio(hi.siniestrosEvitados, a),
      fallecidosAnio: porAnio(c.fallecidosEvitados, a),
      fallecidosMin: porAnio(lo.fallecidosEvitados, a),
      fallecidosMax: porAnio(hi.fallecidosEvitados, a),
      issBase: r.base.iss,
      pocos: r.siniestros < MIN_SINIESTROS_ALCANCE,
      tablaAntes: filas.map((f) => [f.nombre, cifra(f.hoy), cifra(f.despues), `${cifra(f.despuesMin)} a ${cifra(f.despuesMax)}`]),
    };
  });

  // ----- Alcance -----
  private parseKm(valor: string): number | null {
    const t = valor.trim();
    if (t === '') return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : Number.NaN;
  }

  protected cambiarProvincia(ev: Event): void {
    this.alcance.update((a) => ({ ...a, provincia: (ev.target as HTMLSelectElement).value }));
  }
  protected cambiarRuta(ev: Event): void {
    const ruta = (ev.target as HTMLSelectElement).value;
    this.alcance.update((a) => ({ ...a, ruta, kmDesde: null, kmHasta: null }));
  }
  protected cambiarKm(cual: 'kmDesde' | 'kmHasta', ev: Event): void {
    const campo = ev.target as HTMLInputElement;
    const km = this.parseKm(campo.value);
    if (Number.isNaN(km)) {
      campo.value = this.alcance()[cual]?.toString() ?? '';
      this.avisos.error('El kilómetro debe ser un número entero, 0 o mayor.');
      return;
    }
    const a = this.alcance();
    const otro = cual === 'kmDesde' ? a.kmHasta : a.kmDesde;
    if (km !== null && otro !== null && (cual === 'kmDesde' ? km > otro : km < otro)) {
      campo.value = a[cual]?.toString() ?? '';
      this.avisos.error('El kilómetro inicial no puede ser mayor que el final.');
      return;
    }
    this.alcance.update((x) => ({ ...x, [cual]: km }));
  }
  protected elegirTramo(ev: Event): void {
    const id = (ev.target as HTMLSelectElement).value;
    const h = this.tramosCriticos().find((x) => x.id === id);
    if (h) this.alcance.set({ provincia: '', ruta: h.ruta, kmDesde: h.kmInicio, kmHasta: h.kmFin });
    (ev.target as HTMLSelectElement).value = '';
  }
  protected limpiarAlcance(): void {
    this.alcance.set({ ...ALCANCE_NACIONAL });
  }

  // ----- Medidas -----
  protected alternarMedida(cual: NombreMedida, ev: Event): void {
    const activa = (ev.target as HTMLInputElement).checked;
    this.medidas.update((m) => ({ ...m, [cual]: { ...m[cual], activa } }) as Medidas);
  }
  protected alternarFranja(f: FranjaHoraria): void {
    this.medidas.update((m) => {
      const esta = m.patrullaje.franjas.includes(f);
      const franjas = FRANJAS.filter((x) => (x === f ? !esta : m.patrullaje.franjas.includes(x)));
      return { ...m, patrullaje: { ...m.patrullaje, franjas } };
    });
  }
  protected cambiarCobertura(ev: Event): void {
    const campo = ev.target as HTMLInputElement;
    const n = Number(campo.value.replace(',', '.'));
    if (campo.value.trim() === '' || !Number.isFinite(n) || n < 0) {
      campo.value = String(this.medidas().senalizacion.cobertura);
      this.avisos.error('Escriba un porcentaje entre 0 y 100.');
      return;
    }
    const v = Math.min(100, n);
    campo.value = String(v);
    this.medidas.update((m) => ({ ...m, senalizacion: { ...m.senalizacion, cobertura: v } }));
  }
  protected cambiarEfecto(cual: NombreMedida, campo: keyof Efecto, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const n = Number(input.value.replace(',', '.'));
    if (input.value.trim() === '' || !Number.isFinite(n) || n < 0) {
      input.value = String(this.medidas()[cual].efecto[campo]);
      this.avisos.error('Escriba un porcentaje entre 0 y 100.');
      return;
    }
    this.medidas.update((m) => ({ ...m, [cual]: { ...m[cual], efecto: fijarEfecto(m[cual].efecto, campo, n) } }) as Medidas);
    input.value = String(this.medidas()[cual].efecto[campo]);
  }
  protected restablecerMedidas(): void {
    this.medidas.set(copiarMedidas(MEDIDAS_POR_DEFECTO));
    this.avisos.info('Se volvió a los supuestos originales.');
  }

  protected exportar(): void {
    const r = this.resultado();
    if (!r) return;
    const blob = new Blob(['﻿', aCsv(simulacionATabla(r, this.medidas()))], { type: 'text/csv;charset=utf-8' });
    descargar(blob, nombreArchivo('sivcr-simulacion', 'csv'));
  }
}
