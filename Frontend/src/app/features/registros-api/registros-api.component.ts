import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { COLUMNAS_API, ColumnaApi, siguienteOrden } from '../../core/api/columnas-registros-api';
import { ConsultasApiService } from '../../core/api/consultas-api.service';
import { mensajeDeError } from '../../core/api/errores-api';
import {
  CALZADAS_API, CLIMAS_API, DIAS_API, FRANJAS_API, MESES_API, PROVINCIAS_API, SEVERIDADES_API, resumirCriterios,
} from '../../core/api/etiquetas-api';
import { FiltrosApi, aCriterios, contarFiltrosActivos, enteroDeTexto, filtrosApiVacios, validarFiltrosApi } from '../../core/api/filtros-api';
import { FiltrosApiService } from '../../core/api/filtros-api.service';
import { PaginaApi, SiniestroApi } from '../../core/api/modelos-api';
import { OrdenApi, RegistrosApiService } from '../../core/api/registros-api.service';
import { AvisosService } from '../../core/services/avisos.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { DialogoGuardarConsultaApiComponent } from '../../shared/ui/dialogo-guardar-consulta-api.component';
import { PaginadorComponent } from '../../shared/ui/paginador.component';
import { fmtEntero } from '../../shared/utils/formato';
import { PALETA } from '../../shared/utils/paleta';

type CampoTexto = 'canton' | 'distrito' | 'ruta';
type CampoLista = 'provincia' | 'diaSemana' | 'franja' | 'severidad' | 'clima' | 'calzada';

const COLOR_SEVERIDAD: Record<string, string> = {
  SOLO_HERIDOS_LEVES: PALETA.severidad['Leve'],
  CON_MUERTOS_O_GRAVES: PALETA.severidad['Grave'],
  FALLECIDO: PALETA.severidad['Fallecido'],
};

/**
 * Explorador de registros conectado al servidor (HU 20): filtra y pagina en la base de datos con
 * POST /api/records/search, así que funciona con las ~93 000 filas de COSEVI sin traerlas al navegador.
 * Solo se muestran siniestros con calidad VALIDO (regla del servidor). El historial lo anota el servidor al
 * pedir la página 1, por eso esta pantalla no guarda nada por su cuenta.
 */
@Component({
  selector: 'app-registros-api',
  imports: [PaginadorComponent, IconComponent, DialogoGuardarConsultaApiComponent, RouterLink],
  templateUrl: './registros-api.component.html',
  styleUrls: ['../registros/registros.component.scss', './registros-api.component.scss'],
})
export class RegistrosApiComponent implements OnInit {
  private readonly api = inject(RegistrosApiService);
  private readonly consultasApi = inject(ConsultasApiService);
  private readonly aplicadosSrv = inject(FiltrosApiService);
  private readonly avisos = inject(AvisosService);

  protected readonly columnas = COLUMNAS_API;
  protected readonly fmtEntero = fmtEntero;
  protected readonly provincias = PROVINCIAS_API;
  protected readonly meses = MESES_API;
  protected readonly dias = DIAS_API;
  protected readonly franjas = FRANJAS_API;
  protected readonly severidades = SEVERIDADES_API;
  protected readonly climas = CLIMAS_API;
  protected readonly calzadas = CALZADAS_API;

  // ----- Filtros: lo que se está editando (borrador) y lo que ya se aplicó -----
  protected readonly borrador = signal<FiltrosApi>(filtrosApiVacios());
  protected readonly aplicados = this.aplicadosSrv.filtros;
  protected readonly activos = this.aplicadosSrv.activos;
  protected readonly resumenAplicados = computed(() => resumirCriterios(aCriterios(this.aplicados())));
  protected readonly hayCambiosSinAplicar = computed(
    () => JSON.stringify(aCriterios(this.borrador())) !== JSON.stringify(aCriterios(this.aplicados())),
  );
  protected readonly borradorActivo = computed(() => contarFiltrosActivos(this.borrador()));
  protected readonly errorFiltros = signal<string | null>(null);
  protected readonly filtrosAbiertos = signal(true);

  // ----- Tabla -----
  protected readonly pagina = signal(1);
  protected readonly tamanio = signal(25);
  protected readonly orden = signal<OrdenApi | null>(null);
  protected readonly estado = signal<'cargando' | 'ok' | 'error'>('cargando');
  protected readonly resultado = signal<PaginaApi<SiniestroApi> | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly filas = computed(() => this.resultado()?.items ?? []);
  protected readonly total = computed(() => this.resultado()?.total ?? 0);
  protected readonly cantidadPaginas = computed(() => Math.max(1, this.resultado()?.totalPaginas ?? 1));

  // ----- Guardar consulta -----
  protected readonly dialogoGuardar = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);

  /** Para ignorar respuestas viejas si la persona cambia de página o de filtros antes de que lleguen */
  private solicitud = 0;

  ngOnInit(): void {
    this.borrador.set({ ...this.aplicados() });
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    const mia = ++this.solicitud;
    this.estado.set('cargando');
    this.error.set(null);
    try {
      const r = await firstValueFrom(
        this.api.buscar(aCriterios(this.aplicados()), this.pagina() - 1, this.tamanio(), this.orden()),
      );
      if (mia !== this.solicitud) return;
      // Si los datos cambiaron y la página ya no existe, se pasa a la última en vez de mostrar una tabla vacía
      if (r.items.length === 0 && r.total > 0 && this.pagina() > 1) {
        this.pagina.set(Math.max(1, r.totalPaginas));
        await this.cargar();
        return;
      }
      this.resultado.set(r);
      this.estado.set('ok');
    } catch (e) {
      if (mia !== this.solicitud) return;
      this.error.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  // ----- Edición de filtros -----
  protected cambiarLista(campo: CampoLista, evento: Event): void {
    this.borrador.update((f) => ({ ...f, [campo]: (evento.target as HTMLSelectElement).value }));
  }

  protected cambiarTexto(campo: CampoTexto, evento: Event): void {
    this.borrador.update((f) => ({ ...f, [campo]: (evento.target as HTMLInputElement).value }));
  }

  protected cambiarAnio(evento: Event): void {
    this.borrador.update((f) => ({ ...f, anio: enteroDeTexto((evento.target as HTMLInputElement).value) }));
  }

  protected cambiarMes(evento: Event): void {
    const v = (evento.target as HTMLSelectElement).value;
    this.borrador.update((f) => ({ ...f, mes: v ? Number(v) : null }));
  }

  protected aplicar(evento?: Event): void {
    evento?.preventDefault();
    const motivo = validarFiltrosApi(this.borrador());
    this.errorFiltros.set(motivo);
    if (motivo) return;
    this.aplicadosSrv.reemplazar(this.borrador());
    this.pagina.set(1);
    void this.cargar();
  }

  protected limpiar(): void {
    this.borrador.set(filtrosApiVacios());
    this.errorFiltros.set(null);
    this.aplicadosSrv.limpiar();
    this.pagina.set(1);
    void this.cargar();
  }

  // ----- Orden y paginación -----
  protected ordenarPor(c: ColumnaApi): void {
    if (!c.orden) return;
    this.orden.set(siguienteOrden(this.orden(), c.orden));
    this.pagina.set(1);
    void this.cargar();
  }

  protected direccionDe(c: ColumnaApi): 'asc' | 'desc' | undefined {
    const o = this.orden();
    return o && o.campo === c.orden ? o.direccion : undefined;
  }

  protected ariaSort(c: ColumnaApi): 'ascending' | 'descending' | 'none' {
    const d = this.direccionDe(c);
    return d === 'asc' ? 'ascending' : d === 'desc' ? 'descending' : 'none';
  }

  protected cambiarPagina(p: number): void {
    this.pagina.set(p);
    void this.cargar();
  }

  protected cambiarTamanio(n: number): void {
    this.tamanio.set(n);
    this.pagina.set(1);
    void this.cargar();
  }

  protected colorSeveridad(s: SiniestroApi): string {
    return (s.severidad && COLOR_SEVERIDAD[s.severidad]) || PALETA.atenuado;
  }

  // ----- Guardar la consulta aplicada -----
  protected abrirGuardar(): void {
    this.errorGuardar.set(null);
    this.dialogoGuardar.set(true);
  }

  protected async guardarConsulta(nombre: string): Promise<void> {
    this.guardando.set(true);
    this.errorGuardar.set(null);
    try {
      await firstValueFrom(this.consultasApi.guardar(nombre, aCriterios(this.aplicados())));
      this.dialogoGuardar.set(false);
      this.avisos.exito(`Consulta «${nombre}» guardada.`);
    } catch (e) {
      this.errorGuardar.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
