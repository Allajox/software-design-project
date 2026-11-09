import { Component, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { EstadisticasService } from '../../core/services/estadisticas.service';
import { AvisosService } from '../../core/services/avisos.service';
import { ExportacionService, MAX_FILAS_PDF } from '../../core/services/exportacion.service';
import { FiltrosService } from '../../core/services/filtros.service';
import { resumirFiltros } from '../../core/services/filtros-resumen';
import {
  COLUMNAS, COLUMNA_POR_CLAVE, CriterioOrden, Direccion, alternarCriterio, ordenarSiniestros, paginar, totalPaginas,
} from '../../core/services/tabla-siniestros';
import { IconComponent } from '../../shared/icon/icon.component';
import { PaginadorComponent } from '../../shared/ui/paginador.component';
import { PALETA } from '../../shared/utils/paleta';
import { fmtEntero } from '../../shared/utils/formato';
import { PanelFiltrosComponent } from '../dashboard/panel-filtros/panel-filtros.component';

type FormatoExportacion = 'csv' | 'xlsx' | 'pdf';

const ORDEN_INICIAL: readonly CriterioOrden[] = [{ clave: 'fecha', direccion: 'desc' }];

/**
 * Explorador tabular (RF-4): los mismos filtros del dashboard, una tabla con paginación y
 * ordenamiento multinivel, y exportación a CSV, Excel y PDF de TODO lo filtrado (no solo la página).
 * Ordenar, paginar y exportar son funciones puras de `tabla-siniestros.ts` y `exportacion.ts`.
 */
@Component({
  selector: 'app-registros',
  imports: [PanelFiltrosComponent, PaginadorComponent, IconComponent],
  templateUrl: './registros.component.html',
  styleUrl: './registros.component.scss',
})
export class RegistrosComponent {
  protected readonly est = inject(EstadisticasService);
  private readonly filtrosSrv = inject(FiltrosService);
  private readonly exportacion = inject(ExportacionService);
  private readonly avisos = inject(AvisosService);

  protected readonly columnas = COLUMNAS;
  protected readonly maxFilasPdf = MAX_FILAS_PDF;
  protected readonly fmtEntero = fmtEntero;

  // ----- Estado de la tabla -----
  protected readonly criterios = signal<readonly CriterioOrden[]>(ORDEN_INICIAL);
  protected readonly pagina = signal(1);
  protected readonly tamanio = signal(25);
  protected readonly columnasVisibles = signal<ReadonlySet<string>>(
    new Set(COLUMNAS.filter((c) => c.visibleInicial).map((c) => c.clave)),
  );
  protected readonly exportando = signal<FormatoExportacion | null>(null);

  private readonly menuColumnas = viewChild<ElementRef<HTMLDetailsElement>>('menuColumnas');

  // ----- Datos derivados -----
  protected readonly filtrados = this.est.filtrados;
  protected readonly ordenados = computed(() => ordenarSiniestros(this.filtrados(), this.criterios()));
  protected readonly cantidadPaginas = computed(() => totalPaginas(this.filtrados().length, this.tamanio()));
  /** La página nunca se pasa del final, aunque los filtros dejen menos registros */
  protected readonly paginaEfectiva = computed(() => Math.min(this.pagina(), this.cantidadPaginas()));
  protected readonly filas = computed(() => paginar(this.ordenados(), this.paginaEfectiva(), this.tamanio()));
  protected readonly columnasMostradas = computed(() => COLUMNAS.filter((c) => this.columnasVisibles().has(c.clave)));
  protected readonly columnasDisponiblesParaOrden = computed(() =>
    COLUMNAS.filter((c) => !this.criterios().some((k) => k.clave === c.clave)),
  );
  protected readonly esOrdenInicial = computed(
    () => JSON.stringify(this.criterios()) === JSON.stringify(ORDEN_INICIAL),
  );

  constructor() {
    // Al cambiar los filtros se vuelve a la primera página
    effect(() => {
      this.filtrados();
      untracked(() => this.pagina.set(1));
    });
  }

  // ----- Ordenamiento -----
  protected ordenarPor(clave: string, evento: MouseEvent): void {
    this.criterios.set(alternarCriterio(this.criterios(), clave, evento.shiftKey));
    this.pagina.set(1);
  }

  protected direccionDe(clave: string): Direccion | undefined {
    return this.criterios().find((c) => c.clave === clave)?.direccion;
  }

  protected ariaSort(clave: string): 'ascending' | 'descending' | 'none' {
    const d = this.direccionDe(clave);
    return d === 'asc' ? 'ascending' : d === 'desc' ? 'descending' : 'none';
  }

  /** Flecha + número de prioridad (solo si hay más de un criterio) */
  protected prioridad(clave: string): string {
    const i = this.criterios().findIndex((c) => c.clave === clave);
    return i >= 0 && this.criterios().length > 1 ? String(i + 1) : '';
  }

  protected tituloDe(clave: string): string {
    return COLUMNA_POR_CLAVE.get(clave)?.titulo ?? clave;
  }

  protected invertirCriterio(clave: string): void {
    this.criterios.update((lista) =>
      lista.map((c) => (c.clave === clave ? { clave, direccion: c.direccion === 'asc' ? 'desc' : 'asc' } : c)),
    );
    this.pagina.set(1);
  }

  protected quitarCriterio(clave: string): void {
    this.criterios.update((lista) => lista.filter((c) => c.clave !== clave));
    this.pagina.set(1);
  }

  protected agregarCriterio(evento: Event): void {
    const select = evento.target as HTMLSelectElement;
    if (select.value) {
      this.criterios.update((lista) => [...lista, { clave: select.value, direccion: 'asc' }]);
      this.pagina.set(1);
    }
    select.value = '';
  }

  protected restablecerOrden(): void {
    this.criterios.set(ORDEN_INICIAL);
    this.pagina.set(1);
  }

  // ----- Paginación -----
  protected cambiarTamanio(n: number): void {
    this.tamanio.set(n);
    this.pagina.set(1);
  }

  // ----- Columnas visibles -----
  protected alternarColumna(clave: string): void {
    const nuevas = new Set(this.columnasVisibles());
    if (nuevas.has(clave)) {
      if (nuevas.size === 1) return; // siempre queda al menos una columna
      nuevas.delete(clave);
    } else {
      nuevas.add(clave);
    }
    this.columnasVisibles.set(nuevas);
  }

  @HostListener('document:click', ['$event'])
  protected cerrarMenuAlHacerClicFuera(e: MouseEvent): void {
    const menu = this.menuColumnas()?.nativeElement;
    if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
  }

  @HostListener('document:keydown.escape')
  protected cerrarMenuConEscape(): void {
    const menu = this.menuColumnas()?.nativeElement;
    if (menu?.open) menu.open = false;
  }

  // ----- Presentación de celdas -----
  protected colorSeveridad(texto: string): string {
    return PALETA.severidad[texto] ?? PALETA.atenuado;
  }

  protected limpiarFiltros(): void {
    this.filtrosSrv.limpiar();
  }

  // ----- Exportación -----
  protected async exportar(formato: FormatoExportacion): Promise<void> {
    const datos = this.ordenados(); // todo lo filtrado, en el orden que se ve
    if (datos.length === 0) {
      this.avisos.info('No hay registros para exportar con los filtros actuales.');
      return;
    }
    const filtros = resumirFiltros(this.filtrosSrv.filtros());
    this.exportando.set(formato);
    try {
      if (formato === 'csv') {
        this.exportacion.exportarCsv(datos);
        this.avisos.exito(`CSV generado con ${fmtEntero(datos.length)} registros.`);
      } else if (formato === 'xlsx') {
        await this.exportacion.exportarExcel(datos, filtros);
        this.avisos.exito(`Excel generado con ${fmtEntero(datos.length)} registros.`);
      } else {
        const r = await this.exportacion.exportarPdf(datos, filtros);
        this.avisos.exito(
          r.incluidas < r.total
            ? `PDF generado con los primeros ${fmtEntero(r.incluidas)} de ${fmtEntero(r.total)} registros.`
            : `PDF generado con ${fmtEntero(r.total)} registros.`,
        );
      }
    } catch (error) {
      console.error(error);
      this.avisos.error('No se pudo generar el archivo. Intente de nuevo.');
    } finally {
      this.exportando.set(null);
    }
  }
}
