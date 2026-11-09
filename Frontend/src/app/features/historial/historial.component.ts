import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Filtros } from '../../core/models/siniestro.models';
import { AvisosService } from '../../core/services/avisos.service';
import { ConsultasService } from '../../core/services/consultas.service';
import { DatosVialesService } from '../../core/services/datos-viales.service';
import { aplicarFiltros } from '../../core/services/filtrado';
import { FiltrosService } from '../../core/services/filtros.service';
import { resumirFiltros } from '../../core/services/filtros-resumen';
import { IconComponent } from '../../shared/icon/icon.component';
import { DialogoNombreConsultaComponent } from '../../shared/ui/dialogo-nombre-consulta.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { fmtEntero } from '../../shared/utils/formato';

/** Una consulta lista para mostrar: filtros en frases y cuántos siniestros devuelve hoy */
interface EntradaVista {
  id: string;
  titulo: string;
  fecha: string;
  filtros: Filtros;
  resumen: string[];
  resultados: string;
}

type DialogoNombre =
  | { tipo: 'guardar'; filtros: Filtros }
  | { tipo: 'renombrar'; id: string; nombre: string };

interface Confirmacion {
  titulo: string;
  mensaje: string;
  boton: string;
  accion: () => void;
}

const formatoFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Historial de consultas (RF-5): combinaciones de filtros guardadas con nombre y las consultas
 * recientes que el sistema anota solo. Aplicar una consulta carga sus filtros y abre el dashboard.
 */
@Component({
  selector: 'app-historial',
  imports: [IconComponent, RouterLink, ModalComponent, DialogoNombreConsultaComponent],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.scss',
})
export class HistorialComponent {
  protected readonly consultas = inject(ConsultasService);
  private readonly filtrosSrv = inject(FiltrosService);
  private readonly datos = inject(DatosVialesService);
  private readonly router = inject(Router);
  private readonly avisos = inject(AvisosService);
  protected readonly fmtEntero = fmtEntero;

  protected readonly dialogoNombre = signal<DialogoNombre | null>(null);
  protected readonly confirmacion = signal<Confirmacion | null>(null);

  private resultadosHoy(f: Filtros): string {
    const n = aplicarFiltros(this.datos.siniestros(), f).length;
    return `${fmtEntero(n)} ${n === 1 ? 'siniestro' : 'siniestros'}`;
  }

  protected readonly guardadas = computed<EntradaVista[]>(() =>
    this.consultas.guardadas().map((c) => ({
      id: c.id,
      titulo: c.nombre,
      fecha: `Guardada el ${formatoFecha(c.creadaEn)}`,
      filtros: c.filtros,
      resumen: resumirFiltros(c.filtros),
      resultados: this.resultadosHoy(c.filtros),
    })),
  );

  protected readonly recientes = computed<EntradaVista[]>(() =>
    this.consultas.recientes().map((r) => ({
      id: r.id,
      titulo: formatoFecha(r.fecha),
      fecha: '',
      filtros: r.filtros,
      resumen: resumirFiltros(r.filtros),
      resultados: this.resultadosHoy(r.filtros),
    })),
  );

  // ----- Reutilizar -----
  protected aplicar(e: EntradaVista, destino: '/dashboard' | '/registros'): void {
    this.filtrosSrv.reemplazar(e.filtros);
    this.avisos.info('Filtros aplicados. Puede seguir ajustándolos.');
    void this.router.navigateByUrl(destino);
  }

  // ----- Guardar una reciente / renombrar -----
  protected pedirGuardar(e: EntradaVista): void {
    this.dialogoNombre.set({ tipo: 'guardar', filtros: e.filtros });
  }

  protected pedirRenombrar(e: EntradaVista): void {
    this.dialogoNombre.set({ tipo: 'renombrar', id: e.id, nombre: e.titulo });
  }

  protected confirmarNombre(nombre: string): void {
    const d = this.dialogoNombre();
    if (!d) return;
    const error =
      d.tipo === 'guardar' ? this.consultas.guardar(nombre, d.filtros) : this.consultas.renombrar(d.id, nombre);
    if (error) {
      this.avisos.error(error);
      return;
    }
    this.dialogoNombre.set(null);
    this.avisos.exito(d.tipo === 'guardar' ? `Consulta «${nombre}» guardada.` : 'Consulta renombrada.');
  }

  protected idExcluido(): string | undefined {
    const d = this.dialogoNombre();
    return d?.tipo === 'renombrar' ? d.id : undefined;
  }

  protected filtrosDelDialogo(): Filtros | null {
    const d = this.dialogoNombre();
    return d?.tipo === 'guardar' ? d.filtros : null;
  }

  protected nombreInicial(): string {
    const d = this.dialogoNombre();
    return d?.tipo === 'renombrar' ? d.nombre : '';
  }

  // ----- Eliminar (siempre con confirmación) -----
  protected pedirEliminarGuardada(e: EntradaVista): void {
    this.confirmacion.set({
      titulo: 'Eliminar consulta guardada',
      mensaje: `¿Eliminar «${e.titulo}»? Esta acción no se puede deshacer.`,
      boton: 'Eliminar',
      accion: () => {
        this.consultas.eliminar(e.id);
        this.avisos.exito('Consulta eliminada.');
      },
    });
  }

  protected pedirEliminarReciente(e: EntradaVista): void {
    this.confirmacion.set({
      titulo: 'Quitar del historial',
      mensaje: '¿Quitar esta consulta del historial?',
      boton: 'Quitar',
      accion: () => this.consultas.eliminarReciente(e.id),
    });
  }

  protected pedirLimpiarRecientes(): void {
    this.confirmacion.set({
      titulo: 'Limpiar historial',
      mensaje: 'Se borrarán todas las consultas recientes. Las consultas guardadas con nombre no se tocan.',
      boton: 'Limpiar historial',
      accion: () => {
        this.consultas.limpiarRecientes();
        this.avisos.exito('Historial limpio.');
      },
    });
  }

  protected ejecutarConfirmacion(): void {
    this.confirmacion()?.accion();
    this.confirmacion.set(null);
  }
}
