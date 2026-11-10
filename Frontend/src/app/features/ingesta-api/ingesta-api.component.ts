import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LIMITE_ARCHIVO_MB, mensajeDeError } from '../../core/api/errores-api';
import { IngestaApiService } from '../../core/api/ingesta-api.service';
import {
  ACEPTAR_ARCHIVOS, FUENTES_API, SIMBOLO_RESULTADO, TITULO_RESULTADO, erroresACsv, erroresRecortados, porcentajeValidas,
  tieneReporte, totalEvaluadas, validarArchivoParaSubir,
} from '../../core/api/ingesta-api';
import { CargaApi, FuenteApi, ReporteCalidadApi } from '../../core/api/modelos-api';
import { AvisosService } from '../../core/services/avisos.service';
import { nombreArchivo } from '../../core/services/exportacion';
import { paginar, totalPaginas } from '../../core/services/tabla-siniestros';
import { IconComponent } from '../../shared/icon/icon.component';
import { PaginadorComponent } from '../../shared/ui/paginador.component';
import { descargar } from '../../shared/utils/descarga';
import { fmtEntero, fmtPct } from '../../shared/utils/formato';

const formatoFecha = (iso: string): string =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

/** Reporte de calidad abierto: de qué carga es y su contenido (o el motivo por el que no hay) */
interface ReporteAbierto {
  carga: CargaApi;
  reporte: ReporteCalidadApi | null;
  motivo: string | null;
}

/**
 * Carga de datos conectada al servidor (HU 1 a 5). Solo ADMIN: el servidor lo exige en cada petición; ocultar la
 * pantalla a los demás roles es solo comodidad. El archivo se envía completo y el SERVIDOR lo valida, lo normaliza y
 * lo guarda: los válidos y los incompletos se guardan (los incompletos no alimentan los KPI oficiales) y los
 * corruptos se descartan. La respuesta llega al terminar, con el resultado EXITOSA, PARCIAL o FALLIDA.
 */
@Component({
  selector: 'app-ingesta-api',
  imports: [IconComponent, RouterLink, PaginadorComponent],
  templateUrl: './ingesta-api.component.html',
  styleUrls: ['../ingesta/ingesta.component.scss', './ingesta-api.component.scss'],
})
export class IngestaApiComponent implements OnInit {
  private readonly api = inject(IngestaApiService);
  private readonly avisos = inject(AvisosService);

  protected readonly fuentes = FUENTES_API;
  protected readonly aceptar = ACEPTAR_ARCHIVOS;
  protected readonly limiteMb = LIMITE_ARCHIVO_MB;
  protected readonly titulo = TITULO_RESULTADO;
  protected readonly simbolo = SIMBOLO_RESULTADO;
  protected readonly fmtEntero = fmtEntero;
  protected readonly fmtPct = fmtPct;
  protected readonly formatoFecha = formatoFecha;
  protected readonly totalEvaluadas = totalEvaluadas;
  protected readonly porcentajeValidas = porcentajeValidas;
  protected readonly erroresRecortados = erroresRecortados;
  protected readonly tieneReporte = tieneReporte;

  // ----- Nueva carga -----
  protected readonly fuente = signal<FuenteApi>('COSEVI');
  protected readonly archivo = signal<File | null>(null);
  protected readonly errorArchivo = signal<string | null>(null);
  protected readonly arrastrando = signal(false);
  protected readonly fase = signal<'inicio' | 'subiendo' | 'resultado'>('inicio');
  protected readonly carga = signal<CargaApi | null>(null);
  protected readonly errorSubida = signal<string | null>(null);

  // ----- Reporte de calidad abierto -----
  protected readonly reporte = signal<ReporteAbierto | null>(null);
  protected readonly cargandoReporte = signal<number | null>(null);

  // ----- Historial de cargas -----
  protected readonly estadoHistorial = signal<'cargando' | 'ok' | 'error'>('cargando');
  protected readonly errorHistorial = signal<string | null>(null);
  protected readonly historial = signal<CargaApi[]>([]);
  protected readonly pagina = signal(1);
  protected readonly tamanio = signal(10);
  protected readonly paginaEfectiva = computed(() => Math.min(this.pagina(), totalPaginas(this.historial().length, this.tamanio())));
  protected readonly cargasPagina = computed(() => paginar(this.historial(), this.paginaEfectiva(), this.tamanio()));

  protected readonly fuenteElegida = computed(() => this.fuentes.find((f) => f.valor === this.fuente()));

  ngOnInit(): void {
    void this.cargarHistorial();
  }

  // ----- Elegir archivo -----
  protected elegirFuente(valor: FuenteApi): void {
    this.fuente.set(valor);
  }

  protected alElegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const f = entrada.files?.[0];
    if (f) this.tomarArchivo(f);
    entrada.value = ''; // permite elegir de nuevo el mismo archivo
  }

  protected alSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    const f = evento.dataTransfer?.files?.[0];
    if (f) this.tomarArchivo(f);
  }

  protected alArrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.arrastrando.set(dentro);
  }

  private tomarArchivo(f: File): void {
    const motivo = validarArchivoParaSubir(f.name, f.size);
    this.errorArchivo.set(motivo);
    this.archivo.set(motivo ? null : f);
  }

  protected quitarArchivo(): void {
    this.archivo.set(null);
    this.errorArchivo.set(null);
  }

  protected formatoPeso(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  // ----- Subir -----
  protected async subir(): Promise<void> {
    const f = this.archivo();
    const info = this.fuenteElegida();
    if (!f || !info || info.pendiente) return;
    this.fase.set('subiendo');
    this.errorSubida.set(null);
    this.reporte.set(null);
    try {
      const resultado = await firstValueFrom(this.api.subir(f, this.fuente()));
      this.carga.set(resultado);
      this.fase.set('resultado');
      this.archivo.set(null);
      void this.cargarHistorial();
    } catch (e) {
      this.errorSubida.set(mensajeDeError(e));
      this.fase.set('inicio');
    }
  }

  protected otraCarga(): void {
    this.carga.set(null);
    this.reporte.set(null);
    this.errorSubida.set(null);
    this.fase.set('inicio');
  }

  // ----- Reporte de calidad -----
  protected async verReporte(c: CargaApi): Promise<void> {
    this.cargandoReporte.set(c.id);
    try {
      const r = await firstValueFrom(this.api.reporte(c.id));
      this.reporte.set({ carga: c, reporte: r, motivo: null });
    } catch (e) {
      // 404: la carga no llegó a evaluar filas (rechazada por formato, columnas o duplicado): no es un error de la aplicación
      const sinReporte = typeof e === 'object' && e !== null && (e as { status?: number }).status === 404;
      this.reporte.set({
        carga: c,
        reporte: null,
        motivo: sinReporte ? 'Esta carga no generó reporte de calidad: se rechazó antes de evaluar las filas.' : mensajeDeError(e),
      });
    } finally {
      this.cargandoReporte.set(null);
    }
  }

  protected cerrarReporte(): void {
    this.reporte.set(null);
  }

  protected descargarErrores(r: ReporteCalidadApi): void {
    descargar(new Blob(['﻿', erroresACsv(r)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(`errores-carga-${r.idCarga}`, 'csv'));
    this.avisos.exito('Reporte descargado.');
  }

  // ----- Historial -----
  protected async cargarHistorial(): Promise<void> {
    this.estadoHistorial.set('cargando');
    this.errorHistorial.set(null);
    try {
      this.historial.set(await firstValueFrom(this.api.historial()));
      this.estadoHistorial.set('ok');
    } catch (e) {
      this.errorHistorial.set(mensajeDeError(e));
      this.estadoHistorial.set('error');
    }
  }

  protected cambiarTamanio(n: number): void {
    this.tamanio.set(n);
    this.pagina.set(1);
  }
}
