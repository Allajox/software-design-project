import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  CRITERIOS_ORDEN, CriterioOrden, Hotspot, LONGITUDES_TRAMO_KM, MINIMOS_SINIESTROS, NIVELES_ALFA, NivelRiesgo,
  PARAMETROS_HOTSPOTS, TEXTO_NIVEL, densidadPorBloque, detectarHotspots, etiquetaTramo, hotspotsATabla,
  ordenarHotspots,
} from '../../core/analisis/hotspots';
import { AvisosService } from '../../core/services/avisos.service';
import { EstadisticasService } from '../../core/services/estadisticas.service';
import { aCsv, nombreArchivo } from '../../core/services/exportacion';
import { ExportacionService } from '../../core/services/exportacion.service';
import { FiltrosService } from '../../core/services/filtros.service';
import { paginar, totalPaginas } from '../../core/services/tabla-siniestros';
import { IconComponent } from '../../shared/icon/icon.component';
import { PaginadorComponent } from '../../shared/ui/paginador.component';
import { descargar } from '../../shared/utils/descarga';
import { fmtDec1, fmtEntero, fmtPct } from '../../shared/utils/formato';
import { MapaCalorComponent } from '../dashboard/graficos/mapa-calor.component';
import { PanelFiltrosComponent } from '../dashboard/panel-filtros/panel-filtros.component';
import { TarjetaKpiComponent } from '../dashboard/tarjeta-kpi.component';

/** Colores y forma de cada nivel. Nunca va solo el color: siempre con la forma y el nombre */
export const ESTILO_NIVEL: Record<NivelRiesgo, { fondo: string; texto: string; forma: string }> = {
  critico: { fondo: '#b3261e', texto: '#ffffff', forma: '▲' },
  alto: { fondo: '#f28c28', texto: '#1f1300', forma: '◆' },
  moderado: { fondo: '#f2c94c', texto: '#2a2100', forma: '●' },
};

/** Fondo del cuerpo de la densidad de siniestros en el mapa */
const COLOR_DENSIDAD = '#9ec5f4';
const MAX_BLOQUES = 60;

/** «menos de 0,01 %» o «0,3 %»: probabilidad en palabras fáciles */
export function textoProbabilidad(p: number): string {
  if (p < 0.0001) return 'menos de 0,01 %';
  return fmtPct(p * 100);
}

/**
 * Hotspots de riesgo (RF-6). Usa los mismos filtros del dashboard: se buscan tramos de carretera
 * con exceso de siniestros dentro de lo que cumple los filtros. La detección es una función pura
 * (`core/analisis/hotspots.ts`); este componente solo guarda los parámetros, la selección y la paginación.
 */
@Component({
  selector: 'app-hotspots',
  imports: [PanelFiltrosComponent, TarjetaKpiComponent, MapaCalorComponent, PaginadorComponent, IconComponent],
  templateUrl: './hotspots.component.html',
  styleUrl: './hotspots.component.scss',
})
export class HotspotsComponent {
  protected readonly est = inject(EstadisticasService);
  private readonly filtrosSrv = inject(FiltrosService);
  private readonly exportacion = inject(ExportacionService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);

  protected readonly longitudes = LONGITUDES_TRAMO_KM;
  protected readonly minimos = MINIMOS_SINIESTROS;
  protected readonly exigencias = NIVELES_ALFA;
  protected readonly criterios = CRITERIOS_ORDEN;
  protected readonly niveles: readonly NivelRiesgo[] = ['critico', 'alto', 'moderado'];
  protected readonly textoNivel = TEXTO_NIVEL;
  protected readonly estiloNivel = ESTILO_NIVEL;
  protected readonly colorDensidad = COLOR_DENSIDAD;
  protected readonly fmtEntero = fmtEntero;
  protected readonly fmtDec1 = fmtDec1;
  protected readonly textoProbabilidad = textoProbabilidad;
  protected readonly etiquetaTramo = etiquetaTramo;

  // ----- Parámetros de la búsqueda -----
  protected readonly longitud = signal<number>(PARAMETROS_HOTSPOTS.longitudTramoKm);
  protected readonly minimo = signal<number>(PARAMETROS_HOTSPOTS.minimoSiniestros);
  protected readonly alfa = signal<number>(PARAMETROS_HOTSPOTS.alfa);
  protected readonly parametrosPorDefecto = computed(
    () =>
      this.longitud() === PARAMETROS_HOTSPOTS.longitudTramoKm &&
      this.minimo() === PARAMETROS_HOTSPOTS.minimoSiniestros &&
      this.alfa() === PARAMETROS_HOTSPOTS.alfa,
  );

  // ----- Resultado -----
  protected readonly filtrados = this.est.filtrados;
  protected readonly resultado = computed(() =>
    detectarHotspots(this.filtrados(), {
      longitudTramoKm: this.longitud(),
      minimoSiniestros: this.minimo(),
      alfa: this.alfa(),
    }),
  );
  protected readonly hotspots = computed(() => this.resultado().hotspots);
  /** Puesto de cada hotspot según su gravedad (no cambia aunque se ordene la tabla de otra forma) */
  protected readonly puestos = computed(() => new Map(this.hotspots().map((h, i) => [h.id, i + 1])));

  // ----- Ranking -----
  protected readonly orden = signal<CriterioOrden>('severidad');
  protected readonly pagina = signal(1);
  protected readonly tamanio = signal(10);
  protected readonly ordenados = computed(() => ordenarHotspots(this.hotspots(), this.orden()));
  protected readonly cantidadPaginas = computed(() => totalPaginas(this.ordenados().length, this.tamanio()));
  protected readonly paginaEfectiva = computed(() => Math.min(this.pagina(), this.cantidadPaginas()));
  protected readonly filas = computed(() => paginar(this.ordenados(), this.paginaEfectiva(), this.tamanio()));

  // ----- Selección -----
  private readonly seleccionId = signal<string | null>(null);
  /** El tramo elegido; si no hay (o ya no existe con los nuevos filtros), el más grave */
  protected readonly seleccionado = computed<Hotspot | null>(
    () => this.hotspots().find((h) => h.id === this.seleccionId()) ?? this.hotspots()[0] ?? null,
  );
  private readonly detalle = viewChild<ElementRef<HTMLElement>>('detalle');

  constructor() {
    // Cuando cambian los filtros o los parámetros se vuelve a la primera página
    effect(() => {
      this.resultado();
      untracked(() => this.pagina.set(1));
    });
  }

  // ----- Indicadores -----
  protected readonly conteoPorNivel = computed(() => {
    const cuenta: Record<NivelRiesgo, number> = { critico: 0, alto: 0, moderado: 0 };
    for (const h of this.hotspots()) cuenta[h.nivel]++;
    return cuenta;
  });

  protected readonly tarjetas = computed(() => {
    const r = this.resultado();
    const n = this.conteoPorNivel();
    const pctKm = r.kmObservados > 0 ? (r.kmEnHotspots / r.kmObservados) * 100 : 0;
    const pctFallecidos = r.fallecidosAnalizados > 0 ? (r.fallecidosEnHotspots / r.fallecidosAnalizados) * 100 : 0;
    return [
      {
        sigla: 'TRAMOS',
        nombre: 'Hotspots detectados',
        valor: fmtEntero(r.hotspots.length),
        unidad: '',
        detalle: `${n.critico} críticos · ${n.alto} altos · ${n.moderado} moderados`,
        formula: 'Tramos de ruta con más siniestros de lo que explicaría el azar (ver «¿Cómo se detectan?»)',
      },
      {
        sigla: 'CONCENTRACIÓN',
        nombre: 'Siniestros dentro de hotspots',
        valor: fmtPct(r.porcentajeEnHotspots),
        unidad: '',
        detalle: `${fmtEntero(r.siniestrosEnHotspots)} de ${fmtEntero(r.siniestrosAnalizados)} siniestros`,
        formula: 'Siniestros dentro de algún hotspot ÷ siniestros analizados × 100',
      },
      {
        sigla: 'EXTENSIÓN',
        nombre: 'Red afectada',
        valor: fmtEntero(r.kmEnHotspots),
        unidad: 'km',
        detalle:
          r.kmEnHotspots > 0
            ? `${fmtPct(pctKm)} de los km con datos concentran el ${fmtPct(r.porcentajeEnHotspots)} de los siniestros`
            : 'Sin tramos detectados',
        formula: 'Suma de los km de todos los hotspots ÷ km entre el primer y el último siniestro de cada ruta analizada',
      },
      {
        sigla: 'LETALIDAD',
        nombre: 'Fallecidos en hotspots',
        valor: fmtEntero(r.fallecidosEnHotspots),
        unidad: '',
        detalle: `${fmtPct(pctFallecidos)} de los ${fmtEntero(r.fallecidosAnalizados)} fallecidos analizados`,
        formula: 'Fallecidos dentro de algún hotspot ÷ fallecidos de los siniestros analizados × 100',
      },
    ];
  });

  // ----- Mapa lineal por ruta -----
  protected readonly mapa = computed(() => {
    const r = this.resultado();
    const ancho = Math.max(1, Math.ceil((r.kmTope + 1) / MAX_BLOQUES));
    const bloquesTotales = Math.ceil((r.kmTope + 1) / ancho);
    const escalaKm = bloquesTotales * ancho;
    const densidades = r.perfilRutas.map((p) => densidadPorBloque(p, ancho, r.kmTope));
    const maxBloque = Math.max(1, ...densidades.flat());
    const puestos = this.puestos();

    const filas = r.perfilRutas.map((perfil, i) => ({
      ruta: perfil.ruta,
      total: perfil.total,
      analizada: perfil.analizada,
      bloques: densidades[i].map((n, j) => ({
        alto: (n / maxBloque) * 100,
        tip: `${perfil.ruta} · km ${j * ancho} a ${j * ancho + ancho - 1}\n${fmtEntero(n)} siniestros`,
      })),
      marcas: r.hotspots
        .filter((h) => h.ruta === perfil.ruta)
        .map((h) => ({
          h,
          puesto: puestos.get(h.id) ?? 0,
          izquierda: (h.kmInicio / escalaKm) * 100,
          ancho: ((h.kmFin - h.kmInicio + 1) / escalaKm) * 100,
        })),
    }));

    const paso = escalaKm > 100 ? 20 : 10;
    const marcas: { km: number; pos: number }[] = [];
    for (let km = 0; km < escalaKm; km += paso) marcas.push({ km, pos: (km / escalaKm) * 100 });
    return { filas, bloquesTotales, ancho, escalaKm, ejes: marcas };
  });

  protected readonly sinAnalizar = computed(() =>
    this.resultado()
      .perfilRutas.filter((p) => !p.analizada)
      .map((p) => `${p.ruta} (${p.total})`),
  );

  /** Frase que explica el rigor estadístico con los números de la búsqueda actual */
  protected readonly explicacionRigor = computed(() => {
    const r = this.resultado();
    if (r.tramosEvaluados === 0) return '';
    return `Se revisaron ${fmtEntero(r.tramosEvaluados)} posiciones de tramo. Para que una cuente, la probabilidad de que su cantidad de siniestros sea pura casualidad debe ser menor a 1 entre ${fmtEntero(Math.round(1 / r.alfaPorTramo))}.`;
  });

  protected readonly vacioPorFiltros = computed(() => this.resultado().siniestrosAnalizados === 0);

  // ----- Acciones -----
  protected cambiarNumero(destino: 'longitud' | 'minimo', evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    (destino === 'longitud' ? this.longitud : this.minimo).set(valor);
  }

  protected cambiarAlfa(valor: number): void {
    this.alfa.set(valor);
  }

  protected restablecerParametros(): void {
    this.longitud.set(PARAMETROS_HOTSPOTS.longitudTramoKm);
    this.minimo.set(PARAMETROS_HOTSPOTS.minimoSiniestros);
    this.alfa.set(PARAMETROS_HOTSPOTS.alfa);
  }

  protected cambiarOrden(evento: Event): void {
    this.orden.set((evento.target as HTMLSelectElement).value as CriterioOrden);
    this.pagina.set(1);
  }

  protected cambiarTamanio(n: number): void {
    this.tamanio.set(n);
    this.pagina.set(1);
  }

  protected limpiarFiltros(): void {
    this.filtrosSrv.limpiar();
  }

  /** Elige un tramo. Si viene del mapa, la tabla se mueve a su página y el detalle se acerca a la vista */
  protected seleccionar(h: Hotspot, desdeMapa = false): void {
    this.seleccionId.set(h.id);
    if (!desdeMapa) return;
    const posicion = this.ordenados().findIndex((x) => x.id === h.id);
    if (posicion >= 0) this.pagina.set(Math.floor(posicion / this.tamanio()) + 1);
    setTimeout(() => this.detalle()?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  protected esSeleccionado(h: Hotspot): boolean {
    return this.seleccionado()?.id === h.id;
  }

  protected verEnExplorador(h: Hotspot): void {
    this.filtrosSrv.establecer('ruta', h.ruta);
    this.router.navigateByUrl('/registros');
  }

  protected exportarRanking(): void {
    const lista = this.ordenados();
    if (lista.length === 0) return;
    const blob = new Blob(['﻿', aCsv(hotspotsATabla(lista))], { type: 'text/csv;charset=utf-8' });
    descargar(blob, nombreArchivo('sivcr-hotspots', 'csv'));
    this.avisos.exito(`CSV generado con ${lista.length} hotspots.`);
  }

  protected exportarRegistros(h: Hotspot): void {
    const nombre = `sivcr-hotspot-${h.ruta.toLowerCase().replace(/\s+/g, '-')}-km-${h.kmInicio}-${h.kmFin}`;
    this.exportacion.exportarCsv(h.registros, nombre);
    this.avisos.exito(`CSV generado con ${fmtEntero(h.registros.length)} siniestros del tramo.`);
  }

  // ----- Textos de apoyo -----
  protected ubicacion(h: Hotspot): string {
    return h.cantones.length ? `${h.provincia} · ${h.cantones.join(', ')}` : h.provincia;
  }

  protected tipMarca(h: Hotspot, puesto: number): string {
    return `#${puesto} · ${etiquetaTramo(h)}\nNivel ${TEXTO_NIVEL[h.nivel].toLowerCase()} · ${fmtEntero(h.siniestros)} siniestros\n${fmtDec1(h.razon)} veces lo esperado`;
  }

  protected porAnio(h: Hotspot): { anio: string; n: number; ancho: number }[] {
    const maximo = Math.max(1, ...Object.values(h.porAnio));
    return Object.entries(h.porAnio).map(([anio, n]) => ({ anio, n, ancho: (n / maximo) * 100 }));
  }
}
