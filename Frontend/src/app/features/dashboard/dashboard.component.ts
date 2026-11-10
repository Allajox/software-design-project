import { HttpClient } from '@angular/common/http';
import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { aCriteriosDelPanel } from '../../core/api/criterios-panel';
import { ConsultasApiService } from '../../core/api/consultas-api.service';
import { mensajeDeError } from '../../core/api/errores-api';
import { API_CONFIG } from '../../core/config/api.config';
import { ROLES_ANALISIS } from '../../core/config/roles.config';
import { DIAS, FRANJAS } from '../../core/models/catalogos';
import {
  CAMPOS_FILTRO_PANEL, FILTROS_SOLO_PERSONAS, FILTROS_SOLO_SINIESTROS, resumirFiltrosPanel,
} from '../../core/models/filtros-panel';
import { AuthService } from '../../core/services/auth.service';
import { AvisosService } from '../../core/services/avisos.service';
import { EstadisticasService } from '../../core/services/estadisticas.service';
import { nombreArchivo } from '../../core/services/exportacion';
import { FiltrosPanelService } from '../../core/services/filtros-panel.service';
import { OpcionesPanelService } from '../../core/services/opciones-panel.service';
import { DialogoGuardarConsultaApiComponent } from '../../shared/ui/dialogo-guardar-consulta-api.component';
import { descargar } from '../../shared/utils/descarga';
import { fmtDec1, fmtDec2, fmtEntero, fmtPct } from '../../shared/utils/formato';
import { PALETA } from '../../shared/utils/paleta';
import { BarraElegida, ColumnasComponent, SerieColumnas } from './graficos/columnas.component';
import { MapaCalorComponent } from './graficos/mapa-calor.component';
import { TablaDatosComponent } from './graficos/tabla-datos.component';
import { TarjetaGraficoComponent } from './graficos/tarjeta-grafico.component';
import { IndicadorComponent } from './indicador.component';
import { PanelSelectoresComponent } from './panel-selectores/panel-selectores.component';

/** Nombres cortos bajo las barras de vehículos (como «Moto», «Auto», «Bus» en Figma); el detalle y la tabla traen el nombre completo */
const VEHICULO_CORTO: Record<string, string> = {
  Motocicleta: 'Moto', Automóvil: 'Auto', Autobús: 'Bus', Bicicleta: 'Bici',
  'Cabezal con remolque': 'Cabezal c/ remolque', 'Cabezal sin remolque': 'Cabezal s/ remolque',
  'Vehículo con remolque': 'Veh. c/ remolque',
};

type Pestana = 'resumen' | 'perfil';
type FormatoExportacion = 'csv' | 'xlsx' | 'pdf';

/** Cada barra con un azul de la rampa según su tamaño (la mayor, la más oscura); las más pálidas se descartan. */
function coloresPorMagnitud(valores: readonly number[]): string[] {
  const rampa = PALETA.secuencial.slice(1);
  const maximo = Math.max(0, ...valores);
  return valores.map((v) =>
    maximo === 0 || v <= 0 ? PALETA.vacio : rampa[Math.min(rampa.length - 1, Math.ceil((v / maximo) * rampa.length) - 1)],
  );
}

/**
 * Panel de indicadores (Figma «Panel de indicadores» y «Perfil de víctimas y riesgo»): 13 filtros de una sola opción,
 * dos pestañas, los indicadores TSV, ISS, TPR y condiciones adversas, el mapa de calor día × franja, el Pareto de
 * rutas, las víctimas por género y edad y la tasa de fatalidad por vehículo. Es una pantalla «tonta»: los números los
 * calcula el servidor (GET /api/dashboard) y llegan por EstadisticasService; aquí solo se presentan y los clics en los
 * gráficos se traducen a filtros.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    PanelSelectoresComponent, IndicadorComponent, TarjetaGraficoComponent, TablaDatosComponent, MapaCalorComponent,
    ColumnasComponent, DialogoGuardarConsultaApiComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  host: { '(document:click)': 'cerrarMenuSiClicFuera($event)', '(document:keydown.escape)': 'menuExportar.set(false)' },
})
export class DashboardComponent {
  protected readonly est = inject(EstadisticasService);
  private readonly filtrosSrv = inject(FiltrosPanelService);
  private readonly opciones = inject(OpcionesPanelService);
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(AvisosService);
  private readonly consultasApi = inject(ConsultasApiService);
  private readonly auth = inject(AuthService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly f = this.filtrosSrv.filtros;
  protected readonly activos = this.filtrosSrv.activos;
  protected readonly kpis = this.est.kpis;
  protected readonly totalTexto = computed(() => fmtEntero(this.est.totalRegistros()));
  protected readonly vacio = computed(() => this.est.listo() && this.kpis().siniestros === 0);

  protected readonly pestana = signal<Pestana>('resumen');
  protected readonly menuExportar = signal(false);
  protected readonly exportando = signal(false);

  /** Guardar la combinación de filtros es para quienes analizan; el Consultor Público no ve el botón */
  protected readonly puedeGuardar = computed(() => API_CONFIG.datosReales && this.auth.tieneRol(ROLES_ANALISIS));
  protected readonly dialogoGuardar = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);

  /** Frases de los filtros que se guardan; el vehículo se avisa aparte porque el servidor no lo guarda */
  protected readonly resumenGuardar = computed(() =>
    resumirFiltrosPanel(this.f()).map((frase) => (frase.startsWith('Vehículo:') ? `${frase} (no se guarda)` : frase)),
  );

  // ---------- Indicadores ----------

  protected readonly indicadores = computed(() => {
    const k = this.kpis();
    const f = this.f();
    const vacio = this.vacio();
    const hayZona = !!(f.provincia || f.canton || f.distrito || f.ruta);
    const sinTpr = k.tpr <= 0;
    const sinDatos = '—';
    return [
      {
        clave: 'tsv', nombre: 'Tasa de siniestralidad vial', sigla: 'TSV',
        valor: vacio ? sinDatos : fmtDec1(k.tsv), unidad: vacio ? '' : '%',
        detalle: hayZona ? 'de los siniestros del total nacional' : 'Global: es el total nacional',
        formula: 'TSV = (siniestros de la zona ÷ total nacional) × 100. El total nacional respeta los filtros que no son de ubicación.',
      },
      {
        clave: 'iss', nombre: 'Índice de severidad', sigla: 'ISS',
        valor: vacio ? sinDatos : fmtDec2(k.iss), unidad: '',
        detalle: 'Ponderación configurable',
        formula: 'ISS = (W1·fallecidos + W2·heridos graves + W3·heridos leves) ÷ total de siniestros. Los pesos W se configuran en Usuarios y Configuración.',
      },
      {
        clave: 'tpr', nombre: 'Tiempo promedio de respuesta', sigla: 'TPR',
        valor: vacio || sinTpr ? sinDatos : fmtDec1(k.tpr), unidad: vacio || sinTpr ? '' : 'min',
        detalle: sinTpr ? 'La fuente (COSEVI) no trae este dato' : 'Cuerpos de atención',
        formula: 'TPR = suma de los tiempos de respuesta ÷ cantidad de siniestros con tiempo registrado.',
      },
      this.adversas('Condiciones adversas', 'Clima o calzada'),
    ];
  });

  protected readonly adversasPerfil = computed(() =>
    this.adversas('Siniestros en condiciones adversas', 'Clima o calzada adversos sobre el total filtrado'),
  );

  private adversas(nombre: string, detalle: string) {
    const vacio = this.vacio();
    return {
      clave: 'ic', nombre, sigla: '',
      valor: vacio ? '—' : fmtDec1(this.kpis().ic), unidad: vacio ? '' : '%', detalle,
      formula: 'IC = (siniestros con clima o calzada adversos ÷ total de siniestros) × 100. Qué se considera adverso se configura en Usuarios y Configuración.',
    };
  }

  /** Personas afectadas (fallecidas, heridas graves y leves) con los filtros de personas */
  protected readonly personasAfectadas = computed(() => {
    const k = this.kpis();
    return `${fmtEntero(k.victimas)} personas afectadas: ${fmtEntero(k.fallecidos)} fallecidas · ${fmtEntero(k.heridosGraves)} heridas graves · ${fmtEntero(k.heridosLeves)} heridas leves`;
  });

  /**
   * Los filtros de ruta, franja, clima y calzada no existen para las personas, y los de vehículo, edad y género no
   * existen para los siniestros (COSEVI no permite enlazar a una persona con su siniestro). Si hay alguno elegido que
   * no afecta a la pestaña abierta, se avisa para que nadie piense que el gráfico «no responde».
   */
  protected readonly avisoAlcance = computed(() => {
    const f = this.f();
    const enResumen = this.pestana() === 'resumen';
    const sinEfecto = enResumen ? FILTROS_SOLO_PERSONAS : FILTROS_SOLO_SINIESTROS;
    const elegidos = CAMPOS_FILTRO_PANEL.filter((c) => sinEfecto.includes(c.clave) && f[c.clave] !== '').map((c) =>
      c.etiqueta.toLowerCase(),
    );
    if (elegidos.length === 0) return '';
    const lista = elegidos.length === 1 ? elegidos[0] : `${elegidos.slice(0, -1).join(', ')} y ${elegidos.at(-1)}`;
    const quien = enResumen ? 'personas' : 'siniestros';
    const que = enResumen ? 'los indicadores y gráficos de siniestros' : 'los gráficos de víctimas';
    return elegidos.length === 1
      ? `El filtro de ${lista} solo aplica a datos de ${quien}: no cambia ${que}.`
      : `Los filtros de ${lista} solo aplican a datos de ${quien}: no cambian ${que}.`;
  });

  // ---------- Resumen: mapa de calor y Pareto ----------

  protected readonly tablaCalor = computed(() => {
    const m = this.est.matrizDiaFranja();
    return m.dias.map((dia, i) => [dia, ...m.valores[i].map(fmtEntero)]);
  });
  protected readonly columnasCalor = computed(() => ['Día', ...this.est.matrizDiaFranja().franjas]);
  protected readonly diasSel = computed(() => (this.f().dia ? [this.f().dia] : []));
  protected readonly franjasSel = computed(() => (this.f().franja ? [this.f().franja] : []));

  private readonly rutas = computed(() => this.est.rutasPrincipales());
  protected readonly categoriasRuta = computed(() => this.rutas().map((r) => r.etiqueta));
  protected readonly cortasRuta = computed(() => this.rutas().map((r) => r.etiqueta.replace(/^Ruta\s+/i, 'R')));
  protected readonly serieRutas = computed<SerieColumnas[]>(() => [
    { nombre: 'Siniestros', color: PALETA.serie1, valores: this.rutas().map((r) => r.valor) },
  ]);
  protected readonly coloresRutas = computed(() => coloresPorMagnitud(this.rutas().map((r) => r.valor)));
  protected readonly rutaSel = computed(() => (this.f().ruta ? [this.f().ruta] : []));
  protected readonly tablaRuta = computed(() =>
    this.rutas().map((r) => [r.etiqueta, fmtEntero(r.valor), fmtPct(r.porcentaje), fmtPct(r.acumulado)]),
  );
  protected readonly detalleRuta = (ruta: string, _serie: string, valor: number): string => {
    const r = this.rutas().find((x) => x.etiqueta === ruta);
    return `${ruta}\n${fmtEntero(valor)} siniestros (${fmtPct(r?.porcentaje ?? 0)})\nAcumulado: ${fmtPct(r?.acumulado ?? 0)}`;
  };

  // ---------- Perfil: víctimas por género y edad, y tasa de fatalidad por vehículo ----------

  /** De menor a mayor edad (el servidor las manda de mayor a menor, como pirámide) */
  protected readonly edadesGrafico = computed(() => [...this.est.perfilDemografico().edades].reverse());
  protected readonly serieGenero = computed<SerieColumnas[]>(() => {
    const p = this.est.perfilDemografico();
    return [
      { nombre: 'Masculino', color: PALETA.serie1, valores: [...p.masculino].reverse() },
      { nombre: 'Femenino', color: PALETA.serie2, valores: [...p.femenino].reverse() },
    ];
  });
  protected readonly edadSel = computed(() => (this.f().edad && this.f().genero ? [this.f().edad] : []));
  protected readonly tablaGenero = computed(() => {
    const p = this.est.perfilDemografico();
    return [...p.edades].reverse().map((e, i) => [
      e, fmtEntero([...p.masculino].reverse()[i]), fmtEntero([...p.femenino].reverse()[i]),
    ]);
  });
  protected readonly detalleGenero = (edad: string, genero: string, valor: number): string =>
    `${edad} años · ${genero}\n${fmtEntero(valor)} personas`;

  /** De mayor a menor tasa de fatalidad */
  private readonly vehiculos = computed(() =>
    [...this.est.porVehiculo()].sort((a, b) => b.tasaFatalidad - a.tasaFatalidad || b.valor - a.valor),
  );
  protected readonly categoriasVehiculo = computed(() => this.vehiculos().map((v) => v.etiqueta));
  protected readonly cortasVehiculo = computed(() => this.vehiculos().map((v) => VEHICULO_CORTO[v.etiqueta] ?? v.etiqueta));
  protected readonly serieVehiculo = computed<SerieColumnas[]>(() => [
    { nombre: 'Tasa de fatalidad', color: PALETA.serie1, valores: this.vehiculos().map((v) => v.tasaFatalidad) },
  ]);
  protected readonly coloresVehiculo = computed(() => coloresPorMagnitud(this.vehiculos().map((v) => v.tasaFatalidad)));
  protected readonly vehiculoSel = computed(() => (this.f().vehiculo ? [this.f().vehiculo] : []));
  protected readonly tablaVehiculo = computed(() =>
    this.vehiculos().map((v) => [v.etiqueta, fmtEntero(v.valor), fmtPct(v.tasaFatalidad)]),
  );
  protected readonly detalleVehiculo = (vehiculo: string, _serie: string, valor: number): string => {
    const v = this.vehiculos().find((x) => x.etiqueta === vehiculo);
    const aviso = this.esFiltrable(vehiculo) ? '' : '\nNo se puede usar como filtro';
    return `${vehiculo}\nTasa de fatalidad: ${fmtPct(valor)}\n${fmtEntero(v?.valor ?? 0)} personas${aviso}`;
  };
  protected readonly formatoPct = fmtPct;

  // ---------- Pestañas ----------

  protected elegirPestana(p: Pestana): void {
    this.pestana.set(p);
  }

  /** Flechas izquierda y derecha pasan de una pestaña a la otra (patrón de pestañas del teclado) */
  protected teclasPestanas(evento: KeyboardEvent): void {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
    evento.preventDefault();
    const siguiente: Pestana = this.pestana() === 'resumen' ? 'perfil' : 'resumen';
    this.pestana.set(siguiente);
    this.elemento.nativeElement.querySelector<HTMLElement>(`#pestana-${siguiente}`)?.focus();
  }

  // ---------- Clics en los gráficos → filtros ----------

  protected alternarDia(valor: string): void {
    if ((DIAS as readonly string[]).includes(valor)) this.filtrosSrv.alternar('dia', valor);
  }

  protected alternarFranja(valor: string): void {
    if ((FRANJAS as readonly string[]).includes(valor)) this.filtrosSrv.alternar('franja', valor);
  }

  protected alternarRuta(barra: BarraElegida): void {
    this.filtrosSrv.alternar('ruta', barra.categoria);
  }

  protected alternarVehiculo(barra: BarraElegida): void {
    if (this.esFiltrable(barra.categoria)) this.filtrosSrv.alternar('vehiculo', barra.categoria);
  }

  /** Un clic en una barra de género y edad elige las dos cosas; otro clic en la misma las quita */
  protected alternarGeneroYEdad(barra: BarraElegida): void {
    const f = this.f();
    const ya = f.edad === barra.categoria && f.genero === barra.serie;
    this.filtrosSrv.establecer('edad', ya ? '' : barra.categoria);
    this.filtrosSrv.establecer('genero', ya ? '' : barra.serie);
  }

  /** «Peatón» y «Sin dato» son grupos del gráfico, no tipos de vehículo que exista en los datos */
  private esFiltrable(vehiculo: string): boolean {
    return this.opciones.datos().vehiculos.includes(vehiculo);
  }

  protected limpiar(): void {
    this.filtrosSrv.limpiar();
  }

  // ---------- Exportar ----------

  protected cerrarMenuSiClicFuera(evento: Event): void {
    if (!this.menuExportar()) return;
    const zona = this.elemento.nativeElement.querySelector('.exportar');
    if (zona && !zona.contains(evento.target as Node)) this.menuExportar.set(false);
  }

  protected exportar(formato: FormatoExportacion): void {
    this.menuExportar.set(false);
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

  // ---------- Guardar filtros ----------

  protected abrirGuardar(): void {
    this.errorGuardar.set(null);
    this.dialogoGuardar.set(true);
  }

  protected async guardarConsulta(nombre: string): Promise<void> {
    this.guardando.set(true);
    this.errorGuardar.set(null);
    try {
      await firstValueFrom(this.consultasApi.guardar(nombre, aCriteriosDelPanel(this.f())));
      this.dialogoGuardar.set(false);
      this.avisos.exito(`Consulta «${nombre}» guardada. La encuentra en el Historial de consultas.`);
    } catch (e) {
      this.errorGuardar.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
