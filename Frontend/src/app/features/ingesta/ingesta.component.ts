import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CAMPOS } from '../../core/ingesta/esquema';
import { IngestaService, ModoImportacion } from '../../core/ingesta/ingesta.service';
import { MAX_BYTES, MAX_FILAS } from '../../core/ingesta/lector';
import { ETIQUETA_CODIGO, plantillaCsv, problemasACsv, rechazadasACsv } from '../../core/ingesta/reporte';
import { CodigoProblema, Gravedad } from '../../core/ingesta/validacion';
import { AvisosService } from '../../core/services/avisos.service';
import { DatosVialesService } from '../../core/services/datos-viales.service';
import { nombreArchivo } from '../../core/services/exportacion';
import { paginar, totalPaginas } from '../../core/services/tabla-siniestros';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PaginadorComponent } from '../../shared/ui/paginador.component';
import { descargar } from '../../shared/utils/descarga';
import { fmtEntero, fmtPct } from '../../shared/utils/formato';

const CSV_TIPO = 'text/csv;charset=utf-8';
/** El BOM hace que Excel reconozca las tildes y la ñ */
const csvBlob = (csv: string) => new Blob(['﻿', csv], { type: CSV_TIPO });

/**
 * Carga de datos (RF-1): se elige un archivo, el sistema lo valida y muestra el reporte de calidad
 * (qué filas se rechazan y por qué, qué viene incompleto, qué está duplicado) y solo después de
 * confirmar se importan los registros válidos. Toda la lógica está en /core/ingesta.
 */
@Component({
  selector: 'app-ingesta',
  imports: [IconComponent, RouterLink, ModalComponent, PaginadorComponent],
  templateUrl: './ingesta.component.html',
  styleUrl: './ingesta.component.scss',
})
export class IngestaComponent {
  protected readonly srv = inject(IngestaService);
  protected readonly datos = inject(DatosVialesService);
  private readonly avisos = inject(AvisosService);

  protected readonly fmtEntero = fmtEntero;
  protected readonly fmtPct = fmtPct;
  protected readonly etiquetaCodigo = ETIQUETA_CODIGO;
  protected readonly limiteMb = Math.round(MAX_BYTES / 1024 / 1024);
  protected readonly limiteFilas = fmtEntero(MAX_FILAS);
  protected readonly columnasGuia = CAMPOS.filter((c) => !c.ignorar);

  constructor() {
    // El mensaje «Datos importados» es de una sola vez: al volver a esta pantalla se empieza de nuevo
    if (this.srv.fase() === 'importado') this.srv.reiniciar();
  }

  protected readonly arrastrando = signal(false);
  protected readonly confirmarReemplazo = signal(false);
  protected readonly confirmarRestaurar = signal(false);

  // ----- Lista de problemas: filtros y paginación -----
  protected readonly filtroGravedad = signal<'todos' | Gravedad>('todos');
  protected readonly filtroCodigo = signal<CodigoProblema | null>(null);
  protected readonly pagina = signal(1);
  protected readonly tamanio = signal(10);

  /** «Fila» en archivos de tabla; «Registro» en JSON */
  protected readonly unidadFila = computed(() => {
    const f = this.srv.resultado()?.formato;
    return f === 'json' || f === 'geojson' ? 'Registro' : 'Fila';
  });

  protected readonly tiposPresentes = computed(() => {
    const r = this.srv.resultado();
    return r ? (Object.entries(r.porCodigo) as [CodigoProblema, number][]).sort((a, b) => b[1] - a[1]) : [];
  });

  protected readonly problemasFiltrados = computed(() => {
    const r = this.srv.resultado();
    if (!r) return [];
    const g = this.filtroGravedad();
    const c = this.filtroCodigo();
    return r.problemas.filter((p) => (g === 'todos' || p.gravedad === g) && (c === null || p.codigo === c));
  });

  protected readonly paginaEfectiva = computed(() => Math.min(this.pagina(), totalPaginas(this.problemasFiltrados().length, this.tamanio())));
  protected readonly problemasPagina = computed(() => paginar(this.problemasFiltrados(), this.paginaEfectiva(), this.tamanio()));

  /** Porcentajes de la barra apilada (suman 100): sin advertencias, con advertencias, duplicados, rechazadas */
  protected readonly segmentos = computed(() => {
    const r = this.srv.resultado();
    if (!r || r.filasLeidas === 0) return [];
    const duplicados = r.duplicadosArchivo + r.duplicadosSistema;
    const partes = [
      { clase: 'ok', valor: r.importables - r.conAdvertencias },
      { clase: 'aviso', valor: r.conAdvertencias },
      { clase: 'dup', valor: duplicados },
      { clase: 'error', valor: r.rechazados },
    ];
    return partes.filter((p) => p.valor > 0).map((p) => ({ ...p, pct: (p.valor / r.filasLeidas) * 100 }));
  });

  protected readonly vistaPrevia = computed(() => this.srv.resultado()?.registros.slice(0, 5) ?? []);

  protected readonly duplicados = computed(() => {
    const r = this.srv.resultado();
    return r ? r.duplicadosArchivo + r.duplicadosSistema : 0;
  });

  // ----- Elegir archivo -----
  protected alElegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (archivo) void this.procesar(archivo);
    entrada.value = ''; // permite elegir de nuevo el mismo archivo
  }

  protected alSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) void this.procesar(archivo);
  }

  protected alArrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.arrastrando.set(dentro);
  }

  private async procesar(archivo: File): Promise<void> {
    this.filtroGravedad.set('todos');
    this.filtroCodigo.set(null);
    this.pagina.set(1);
    await this.srv.cargar(archivo);
  }

  // ----- Filtros de la lista de problemas -----
  protected cambiarGravedad(evento: Event): void {
    this.filtroGravedad.set((evento.target as HTMLSelectElement).value as 'todos' | Gravedad);
    this.pagina.set(1);
  }

  protected alternarCodigo(codigo: CodigoProblema): void {
    this.filtroCodigo.update((c) => (c === codigo ? null : codigo));
    this.pagina.set(1);
  }

  protected cambiarTamanio(n: number): void {
    this.tamanio.set(n);
    this.pagina.set(1);
  }

  // ----- Importar -----
  protected elegirModo(modo: ModoImportacion): void {
    void this.srv.cambiarModo(modo);
  }

  protected pedirImportar(): void {
    if (this.srv.modo() === 'reemplazar') this.confirmarReemplazo.set(true);
    else this.importar();
  }

  protected importar(): void {
    this.confirmarReemplazo.set(false);
    const n = this.srv.importar();
    if (n > 0) this.avisos.exito(`Se importaron ${fmtEntero(n)} registros.`);
  }

  protected restaurar(): void {
    this.confirmarRestaurar.set(false);
    this.datos.restaurarEjemplo();
    this.srv.reiniciar();
    this.avisos.exito('Se restauraron los datos de ejemplo.');
  }

  // ----- Descargas -----
  protected descargarPlantilla(): void {
    descargar(csvBlob(plantillaCsv()), 'plantilla-siniestros.csv');
  }

  protected descargarReporte(): void {
    const r = this.srv.resultado();
    if (r) descargar(csvBlob(problemasACsv(r)), nombreArchivo('reporte-calidad', 'csv'));
  }

  protected descargarRechazadas(): void {
    const r = this.srv.resultado();
    if (r) descargar(csvBlob(rechazadasACsv(r, this.srv.cabeceras())), nombreArchivo('filas-rechazadas', 'csv'));
  }

  protected formatoPeso(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }
}
