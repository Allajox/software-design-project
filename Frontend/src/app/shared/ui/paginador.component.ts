import { Component, computed, input, output } from '@angular/core';
import { totalPaginas, ventanaPaginas } from '../../core/services/tabla-siniestros';
import { fmtEntero } from '../utils/formato';

/**
 * Barra de paginación: "Mostrando 1–25 de 3 412", botones de página y tamaño de página.
 * No guarda estado: recibe la página actual y avisa cuando la persona quiere otra.
 */
@Component({
  selector: 'app-paginador',
  template: `
    <nav class="paginador" aria-label="Paginación">
      <p class="info" aria-live="polite">{{ rango() }}</p>

      <label class="tamanio">
        <span>Filas por página</span>
        <select (change)="cambiarTamanio.emit(valorNumerico($event))">
          @for (t of opcionesTamanio(); track t) {
            <option [value]="t" [selected]="t === tamanio()">{{ t }}</option>
          }
        </select>
      </label>

      <div class="botones">
        <button type="button" aria-label="Primera página" [disabled]="pagina() <= 1" (click)="cambiarPagina.emit(1)">«</button>
        <button type="button" aria-label="Página anterior" [disabled]="pagina() <= 1" (click)="cambiarPagina.emit(pagina() - 1)">‹</button>
        @for (p of paginas(); track $index) {
          @if (p === '…') {
            <span class="puntos" aria-hidden="true">…</span>
          } @else {
            <button
              type="button"
              [class.actual]="p === pagina()"
              [attr.aria-current]="p === pagina() ? 'page' : null"
              [attr.aria-label]="'Página ' + p"
              (click)="cambiarPagina.emit(p)"
            >{{ p }}</button>
          }
        }
        <button type="button" aria-label="Página siguiente" [disabled]="pagina() >= cantidadPaginas()" (click)="cambiarPagina.emit(pagina() + 1)">›</button>
        <button type="button" aria-label="Última página" [disabled]="pagina() >= cantidadPaginas()" (click)="cambiarPagina.emit(cantidadPaginas())">»</button>
      </div>
    </nav>
  `,
  styles: `
    .paginador { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1.4rem; padding: 0.7rem 0.2rem 0; }
    .info { flex: 1; min-width: 180px; margin: 0; font-size: 0.84rem; color: var(--gris); }
    .tamanio { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--gris); }
    select { padding: 4px 6px; font: inherit; border: 1px solid var(--borde); border-radius: 6px; background: #fff; }
    .botones { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    button {
      min-width: 32px; height: 32px; padding: 0 8px;
      font: inherit; font-size: 0.84rem; color: var(--texto);
      background: #fff; border: 1px solid var(--borde); border-radius: 6px; cursor: pointer;
    }
    button:hover:not(:disabled):not(.actual) { border-color: var(--azul-claro); color: var(--azul-claro); }
    button:disabled { color: #aab3bf; cursor: default; }
    button.actual { color: #fff; background: var(--azul-claro); border-color: var(--azul-claro); font-weight: 600; }
    button:focus-visible, select:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .puntos { padding: 0 4px; color: var(--gris); }
  `,
})
export class PaginadorComponent {
  readonly pagina = input.required<number>();
  readonly tamanio = input.required<number>();
  readonly total = input.required<number>();
  /** Nombre de lo que se cuenta, para el texto "de 3 412 registros" */
  readonly unidad = input('registros');
  readonly opcionesTamanio = input<readonly number[]>([10, 25, 50, 100]);

  readonly cambiarPagina = output<number>();
  readonly cambiarTamanio = output<number>();

  protected readonly cantidadPaginas = computed(() => totalPaginas(this.total(), this.tamanio()));
  protected readonly paginas = computed(() => ventanaPaginas(this.pagina(), this.cantidadPaginas()));

  protected readonly rango = computed(() => {
    const total = this.total();
    if (total === 0) return `0 ${this.unidad()}`;
    const desde = (this.pagina() - 1) * this.tamanio() + 1;
    const hasta = Math.min(total, this.pagina() * this.tamanio());
    return `Mostrando ${fmtEntero(desde)}–${fmtEntero(hasta)} de ${fmtEntero(total)} ${this.unidad()}`;
  });

  protected valorNumerico(e: Event): number {
    return Number((e.target as HTMLSelectElement).value);
  }
}
