import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConsultasApiService } from '../../core/api/consultas-api.service';
import { mensajeDeError } from '../../core/api/errores-api';
import { resumirCriterios } from '../../core/api/etiquetas-api';
import { aCriterios, desdeCriterios } from '../../core/api/filtros-api';
import { FiltrosApiService } from '../../core/api/filtros-api.service';
import { ConsultaGuardadaApi, ConsultaHistorialApi, CriteriosApi } from '../../core/api/modelos-api';
import { AvisosService } from '../../core/services/avisos.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { DialogoGuardarConsultaApiComponent } from '../../shared/ui/dialogo-guardar-consulta-api.component';

/** Una consulta lista para mostrar */
interface EntradaVista {
  id: number;
  titulo: string;
  subtitulo: string;
  criterios: CriteriosApi;
  resumen: string[];
  /** true si la consulta trae criterios que el explorador no aplica (edad, género, tipo de vehículo) */
  conCriteriosNoAplicables: boolean;
}

const formatoFecha = (iso: string): string =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

/** Criterios de víctimas o de vehículo: COSEVI no permite cruzarlos con siniestros, así que el explorador no los aplica. */
const hayNoAplicables = (c: CriteriosApi): boolean =>
  Boolean(c.tipoVehiculo || c.genero || c.edadMin || c.edadMax);

function aVista(id: number, titulo: string, subtitulo: string, criterios: CriteriosApi, respaldo: string): EntradaVista {
  const resumen = resumirCriterios(aCriterios(desdeCriterios(criterios)));
  return {
    id, titulo, subtitulo, criterios,
    resumen: resumen.length > 0 ? resumen : [respaldo],
    conCriteriosNoAplicables: hayNoAplicables(criterios),
  };
}

/**
 * Historial de consultas conectado al servidor (HU 22 y 23): consultas guardadas con nombre y las últimas consultas
 * que el SERVIDOR anotó cuando la persona buscó en el Explorador de registros. Son de cada usuario.
 * Hoy el servidor permite guardar y listar; no permite renombrar, eliminar ni limpiar, y esta pantalla no lo simula.
 */
@Component({
  selector: 'app-historial-api',
  imports: [IconComponent, RouterLink, DialogoGuardarConsultaApiComponent],
  templateUrl: './historial-api.component.html',
  styleUrls: ['../historial/historial.component.scss', './historial-api.component.scss'],
})
export class HistorialApiComponent implements OnInit {
  private readonly api = inject(ConsultasApiService);
  private readonly filtrosSrv = inject(FiltrosApiService);
  private readonly router = inject(Router);
  private readonly avisos = inject(AvisosService);

  protected readonly estado = signal<'cargando' | 'ok' | 'error'>('cargando');
  protected readonly error = signal<string | null>(null);
  private readonly _guardadas = signal<ConsultaGuardadaApi[]>([]);
  private readonly _recientes = signal<ConsultaHistorialApi[]>([]);

  protected readonly guardadas = computed<EntradaVista[]>(() =>
    this._guardadas().map((c) =>
      aVista(c.id, c.nombre, `Guardada el ${formatoFecha(c.creadoEn)}`, c.criterios, 'Sin filtros'),
    ),
  );

  protected readonly recientes = computed<EntradaVista[]>(() =>
    this._recientes().map((r) => aVista(r.id, formatoFecha(r.fecha), '', r.criterios, r.resumen || 'Sin filtros')),
  );

  // ----- Guardar una reciente con nombre -----
  protected readonly porGuardar = signal<EntradaVista | null>(null);
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);
  protected readonly resumenPorGuardar = computed(() => this.porGuardar()?.resumen ?? []);

  ngOnInit(): void {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.estado.set('cargando');
    this.error.set(null);
    try {
      const [guardadas, recientes] = await Promise.all([
        firstValueFrom(this.api.guardadas()),
        firstValueFrom(this.api.historial()),
      ]);
      this._guardadas.set(guardadas);
      this._recientes.set(recientes);
      this.estado.set('ok');
    } catch (e) {
      this.error.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  /** Deja los filtros de la consulta en el explorador y lo abre (que al buscar vuelve a anotarla el servidor). */
  protected aplicar(e: EntradaVista): void {
    this.filtrosSrv.reemplazar(desdeCriterios(e.criterios));
    this.avisos.info(
      e.conCriteriosNoAplicables
        ? 'Filtros aplicados. Se omitieron edad, género y tipo de vehículo: no se pueden combinar con siniestros.'
        : 'Filtros aplicados. Puede seguir ajustándolos.',
    );
    void this.router.navigateByUrl('/registros');
  }

  protected pedirGuardar(e: EntradaVista): void {
    this.errorGuardar.set(null);
    this.porGuardar.set(e);
  }

  protected async confirmarGuardar(nombre: string): Promise<void> {
    const e = this.porGuardar();
    if (!e) return;
    this.guardando.set(true);
    this.errorGuardar.set(null);
    try {
      await firstValueFrom(this.api.guardar(nombre, e.criterios));
      this.porGuardar.set(null);
      this.avisos.exito(`Consulta «${nombre}» guardada.`);
      const guardadas = await firstValueFrom(this.api.guardadas());
      this._guardadas.set(guardadas);
    } catch (err) {
      this.errorGuardar.set(mensajeDeError(err));
    } finally {
      this.guardando.set(false);
    }
  }
}
