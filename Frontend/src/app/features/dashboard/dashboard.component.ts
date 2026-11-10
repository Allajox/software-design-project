import { Component, computed, inject, signal } from '@angular/core';
import { DatosVialesService } from '../../core/services/datos-viales.service';
import { EstadisticasService } from '../../core/services/estadisticas.service';
import { FiltrosService } from '../../core/services/filtros.service';
import { PESOS_SEVERIDAD } from '../../core/services/kpi.calculator';
import { fmtDec1, fmtDec2, fmtEntero, fmtPct } from '../../shared/utils/formato';
import { BarrasRankeadasComponent, FilaBarra } from './graficos/barras-rankeadas.component';
import { DonaComponent } from './graficos/dona.component';
import { MapaCalorComponent } from './graficos/mapa-calor.component';
import { PiramideComponent } from './graficos/piramide.component';
import { TablaDatosComponent } from './graficos/tabla-datos.component';
import { TarjetaGraficoComponent } from './graficos/tarjeta-grafico.component';
import { PanelFiltrosComponent } from './panel-filtros/panel-filtros.component';
import { TarjetaKpiComponent } from './tarjeta-kpi.component';
import { HttpClient } from '@angular/common/http';
import { API_CONFIG } from '../../core/config/api.config';
import { DIAS, EDADES, FRANJAS, GENEROS, PROVINCIAS, SEVERIDADES, TipoVehiculo } from '../../core/models/catalogos';
import { AvisosService } from '../../core/services/avisos.service';
import { nombreArchivo } from '../../core/services/exportacion';
import { descargar } from '../../shared/utils/descarga';

/** Comprueba que un texto pertenece a un catálogo y deja a TypeScript saber de qué tipo es */
function enCatalogo<T extends string>(catalogo: readonly T[], valor: string): valor is T {
  return (catalogo as readonly string[]).includes(valor);
}

/**
 * Dashboard de siniestralidad vial (fase 1): filtros (RF-2), KPIs (RF-3) y gráficos (sección 4).
 * Es una pantalla "tonta": todo el cálculo está en EstadisticasService y el estado de los
 * filtros en FiltrosService. Aquí solo se conectan los datos con los componentes visuales
 * y se traducen los clics de los gráficos a filtros.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    PanelFiltrosComponent, TarjetaKpiComponent, TarjetaGraficoComponent, TablaDatosComponent,
    BarrasRankeadasComponent, DonaComponent, MapaCalorComponent, PiramideComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly est = inject(EstadisticasService);
  protected readonly datos = inject(DatosVialesService);
  private readonly filtrosSrv = inject(FiltrosService);
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(AvisosService);
  protected readonly f = this.filtrosSrv.filtros;

  protected readonly kpis = this.est.kpis;
  protected readonly vacio = computed(() => this.est.listo() && this.kpis().siniestros === 0);

  // ---------- Tarjetas KPI ----------
  protected readonly tarjetas = computed(() => {
    const k = this.kpis();
    const vacio = this.vacio();
    const f = this.f();
    const hayZona = !!(f.provincia || f.canton || f.distrito || f.ruta);
    const sinDatos = '—';
    const sinTpr = k.tpr <= 0;
    return [
      {
        sigla: 'SINIESTROS', nombre: 'Siniestros registrados',
        valor: fmtEntero(k.siniestros), unidad: '',
        detalle: `de ${fmtEntero(k.totalRegistros)} en el período completo`,
        formula: 'Cantidad de siniestros que cumplen todos los filtros activos.',
      },
      {
        sigla: 'TSV', nombre: 'Tasa de siniestralidad vial',
        valor: vacio ? sinDatos : fmtDec1(k.tsv), unidad: vacio ? '' : '%',
        detalle: hayZona ? 'de los siniestros del total nacional' : 'Sin zona elegida: es el total nacional',
        formula: 'TSV = (siniestros de la región ÷ total nacional) × 100. El total nacional respeta los filtros que no son de ubicación.',
      },
      {
        sigla: 'ISS', nombre: 'Índice de severidad',
        valor: vacio ? sinDatos : fmtDec2(k.iss), unidad: '',
        detalle: `Pesos: fallecido ${PESOS_SEVERIDAD.w1Fallecidos} · muertos o graves ${PESOS_SEVERIDAD.w2Graves} · solo leves ${PESOS_SEVERIDAD.w3Leves}`,
        formula: 'ISS = (W1·siniestros de categoría fallecido + W2·siniestros con muertos o graves + W3·siniestros con solo heridos leves) ÷ total de siniestros. Los pesos W son supuestos configurables.',
      },
      {
        sigla: 'TPR', nombre: 'Tiempo promedio de respuesta',
        valor: vacio || sinTpr ? sinDatos : fmtDec1(k.tpr), unidad: vacio || sinTpr ? '' : 'min',
        detalle: sinTpr ? 'La fuente (COSEVI) no trae este dato' : 'hasta la llegada de los cuerpos de atención',
        formula: 'TPR = suma de los tiempos de respuesta ÷ cantidad de siniestros.',
      },
      {
        sigla: 'VÍCTIMAS', nombre: 'Personas afectadas',
        valor: fmtEntero(k.victimas), unidad: '',
        detalle: `${fmtEntero(k.fallecidos)} fallecidas · ${fmtEntero(k.heridosGraves)} graves · ${fmtEntero(k.heridosLeves)} leves`,
        formula: 'Fallecidos + heridos graves + heridos leves de las personas registradas (no incluye ilesos).',
      },
      {
        sigla: 'IC', nombre: 'Impacto por clima y calzada',
        valor: vacio ? sinDatos : fmtDec1(k.ic), unidad: vacio ? '' : '%',
        detalle: 'con lluvia, neblina o derrumbe',
        formula: 'IC = (siniestros con clima o calzada adversos ÷ total de siniestros) × 100. Adverso: lluvia, lluvia fuerte, neblina o derrumbe.',
      },
    ];
  });

  // ---------- Datos de cada gráfico ----------
  protected readonly selProvincia = computed(() => (this.f().provincia ? [this.f().provincia] : []));
  protected readonly selRuta = computed(() => (this.f().ruta ? [this.f().ruta] : []));

  protected readonly filasProvincia = computed<FilaBarra[]>(() =>
    this.est.porProvincia().map((p) => ({
      clave: p.etiqueta,
      etiqueta: p.etiqueta,
      valor: p.porcentaje,
      texto: fmtPct(p.porcentaje),
      extras: [fmtEntero(p.valor)],
      tip: `${p.etiqueta}\nTSV ${fmtPct(p.porcentaje)} · ${fmtEntero(p.valor)} siniestros`,
    })),
  );

  protected readonly filasVehiculo = computed<FilaBarra[]>(() =>
    this.est.porVehiculo().map((v) => ({
      clave: v.etiqueta,
      etiqueta: v.etiqueta,
      valor: v.valor,
      texto: fmtEntero(v.valor),
      extras: [fmtPct(v.tasaFatalidad)],
      tip: `${v.etiqueta}\n${fmtEntero(v.valor)} Personas (${fmtPct(v.porcentaje)})\nTasa de fatalidad: ${fmtPct(v.tasaFatalidad)}`,
    })),
  );

  protected readonly filasRuta = computed<FilaBarra[]>(() =>
    this.est.rutasPrincipales().map((r) => ({
      clave: r.etiqueta,
      etiqueta: r.etiqueta,
      valor: r.valor,
      texto: fmtEntero(r.valor),
      extras: [fmtPct(r.acumulado)],
      tip: `${r.etiqueta}\n${fmtEntero(r.valor)} siniestros (${fmtPct(r.porcentaje)})\nAcumulado: ${fmtPct(r.acumulado)}`,
    })),
  );

  // ---------- Tablas (alternativa accesible a cada gráfico) ----------
  protected readonly tablaProvincia = computed(() =>
    this.est.porProvincia().map((p) => [p.etiqueta, fmtPct(p.porcentaje), fmtEntero(p.valor)]),
  );
  protected readonly tablaVehiculo = computed(() =>
    this.est.porVehiculo().map((v) => [v.etiqueta, fmtEntero(v.valor), fmtPct(v.tasaFatalidad)]),
  );
  protected readonly tablaSeveridad = computed(() =>
    this.est.porSeveridad().map((s) => [s.etiqueta, fmtEntero(s.valor), fmtPct(s.porcentaje)]),
  );
  protected readonly tablaRuta = computed(() =>
    this.est.rutasPrincipales().map((r) => [r.etiqueta, fmtEntero(r.valor), fmtPct(r.acumulado)]),
  );
  protected readonly tablaCalor = computed(() => {
    const m = this.est.matrizDiaFranja();
    return m.dias.map((dia, i) => [dia, ...m.valores[i].map(fmtEntero)]);
  });
  protected readonly columnasCalor = computed(() => ['Día', ...this.est.matrizDiaFranja().franjas]);
  protected readonly tablaPiramide = computed(() => {
    const p = this.est.perfilDemografico();
    return p.edades.map((e, i) => [e, fmtEntero(p.masculino[i]), fmtEntero(p.femenino[i])]);
  });

  // ---------- Clics en los gráficos -> filtros ----------
  protected alternarProvincia(valor: string): void {
    if (!enCatalogo(PROVINCIAS, valor)) return;
    this.filtrosSrv.establecer('provincia', this.f().provincia === valor ? '' : valor);
  }

  protected alternarRuta(valor: string): void {
    this.filtrosSrv.establecer('ruta', this.f().ruta === valor ? '' : valor);
  }

  protected alternarVehiculo(valor: string): void {
    this.filtrosSrv.alternar('vehiculos', valor as TipoVehiculo);
  }

  protected alternarSeveridad(valor: string): void {
    if (enCatalogo(SEVERIDADES, valor)) this.filtrosSrv.alternar('severidades', valor);
  }

  protected alternarDia(valor: string): void {
    if (enCatalogo(DIAS, valor)) this.filtrosSrv.alternar('dias', valor);
  }

  protected alternarFranja(valor: string): void {
    if (enCatalogo(FRANJAS, valor)) this.filtrosSrv.alternar('franjas', valor);
  }

  protected alternarEdad(valor: string): void {
    if (enCatalogo(EDADES, valor)) this.filtrosSrv.alternar('edades', valor);
  }

  protected alternarGenero(valor: string): void {
    if (enCatalogo(GENEROS, valor)) this.filtrosSrv.alternar('generos', valor);
  }

  protected limpiar(): void {
    this.filtrosSrv.limpiar();
  }

  protected readonly exportando = signal(false);

protected exportar(formato: 'csv' | 'xlsx' | 'pdf'): void {
  this.exportando.set(true);
  this.http
    .get(`${API_CONFIG.baseUrl}/dashboard/export`, {
      params: { ...this.est.parametros(), formato },
      responseType: 'blob',
    })
    .subscribe({
      next: (archivo) => {
        descargar(archivo, nombreArchivo('sivcr-dashboard', formato));
        this.exportando.set(false);
      },
      error: () => {
        this.avisos.error('No se pudo generar el reporte. Intente de nuevo.');
        this.exportando.set(false);
      },
    });
}
  
}
