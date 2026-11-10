import { httpResource } from '@angular/common/http';
import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { API_CONFIG } from '../config/api.config';
import { aParametrosPanel } from '../models/filtros-panel';
import { Kpis, Siniestro } from '../models/siniestro.models';
import { DatosVialesService } from './datos-viales.service';
import { FiltrosPanelService } from './filtros-panel.service';
import { FiltrosService } from './filtros.service';
import { aplicarFiltros } from './filtrado';

/** Un valor agrupado listo para graficar (sin formato de texto: eso es cosa de la vista) */
export interface ItemConteo {
  etiqueta: string;
  valor: number;
  /** Porcentaje sobre el total de su grupo, 0-100 */
  porcentaje: number;
}

export interface ItemVehiculo extends ItemConteo {
  /** Tasa de fatalidad del tipo de vehículo (TFv) */
  tasaFatalidad: number;
}

export interface ItemRuta extends ItemConteo {
  /** Porcentaje acumulado hasta esta ruta (ordenadas de mayor a menor) */
  acumulado: number;
}

export interface MatrizDiaFranja {
  dias: readonly string[];
  franjas: readonly string[];
  /** valores[dia][franja] */
  valores: number[][];
  maximo: number;
}

export interface PerfilDemografico {
  edades: string[];
  masculino: number[];
  femenino: number[];
}

/** Lo que devuelve GET /api/dashboard (DashboardPanel en el backend) */
interface RespuestaDashboard {
  /** tpr llega null cuando la fuente no trae tiempos de respuesta */
  kpis: Omit<Kpis, 'tpr'> & { tpr: number | null };
  porProvincia: ItemConteo[];
  porVehiculo: ItemVehiculo[];
  porSeveridad: ItemConteo[];
  rutasPrincipales: ItemRuta[];
  matrizDiaFranja: MatrizDiaFranja;
  perfilDemografico: PerfilDemografico;
}

const SIN_DATOS: RespuestaDashboard = {
  kpis: {
    siniestros: 0, totalRegistros: 0, tsv: 0, iss: 0, tpr: null, victimas: 0,
    fallecidos: 0, heridosGraves: 0, heridosLeves: 0, ic: 0,
  },
  porProvincia: [],
  porVehiculo: [],
  porSeveridad: [],
  rutasPrincipales: [],
  matrizDiaFranja: { dias: [], franjas: [], valores: [], maximo: 0 },
  perfilDemografico: { edades: [], masculino: [], femenino: [] },
};

/**
 * Capa de NEGOCIO del dashboard. Los cálculos ya no se hacen en el navegador: el backend
 * (StatsManager) los hace en PostgreSQL y este servicio solo pide el resultado cada vez que
 * cambian los filtros. La interfaz pública (kpis, porProvincia, ...) es la misma de antes,
 * por eso el dashboard y los gráficos casi no cambian.
 */
@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private readonly datos = inject(DatosVialesService);
  private readonly filtrosSrv = inject(FiltrosService);
  private readonly panelSrv = inject(FiltrosPanelService);
  /** Filtros de selección múltiple: solo para `filtrados` (las pantallas de demostración que aún leen de memoria) */
  private readonly f = this.filtrosSrv.filtros;

  /** Parámetros de la URL: los filtros del panel de indicadores con una opción elegida («Todos» no se envía) */
  readonly parametros = computed(() => aParametrosPanel(this.panelSrv.filtros()));

  private readonly recurso = httpResource<RespuestaDashboard>(() => ({
    url: `${API_CONFIG.baseUrl}/dashboard`,
    params: this.parametros(),
  }));

  /** Mientras llega una respuesta nueva se sigue mostrando la anterior (sin parpadeos) */
  private readonly valorServidor = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));
  private readonly respuesta = linkedSignal<RespuestaDashboard | undefined, RespuestaDashboard>({
    source: this.valorServidor,
    computation: (nueva, anterior) => nueva ?? anterior?.value ?? SIN_DATOS,
  });

  /** true cuando ya hay una respuesta del servidor para los filtros actuales */
  readonly listo = computed(() => this.recurso.status() === 'resolved');
  readonly cargando = this.recurso.isLoading;
  readonly error = this.recurso.error;

  readonly kpis = computed<Kpis>(() => {
    const k = this.respuesta().kpis;
    return { ...k, tpr: k.tpr ?? 0 };
  });
  readonly totalRegistros = computed(() => this.respuesta().kpis.totalRegistros);

  readonly porProvincia = computed(() => this.respuesta().porProvincia);
  readonly porVehiculo = computed(() => this.respuesta().porVehiculo);
  readonly porSeveridad = computed(() => this.respuesta().porSeveridad);
  readonly rutasPrincipales = computed(() => this.respuesta().rutasPrincipales);
  readonly matrizDiaFranja = computed(() => this.respuesta().matrizDiaFranja);
  readonly perfilDemografico = computed(() => this.respuesta().perfilDemografico);

  /**
   * Siniestros filtrados EN MEMORIA (datos de ejemplo). Se deja porque otras pantallas
   * (registros, hotspots...) todavía leen de aquí; el dashboard ya no lo usa.
   */
  readonly filtrados = computed<Siniestro[]>(() => aplicarFiltros(this.datos.siniestros(), this.f()));
}
