import { Component, effect, input, output, signal, untracked } from '@angular/core';
import { LARGO_MAX_NOMBRE_API } from '../../core/api/consultas-api.service';
import { ModalComponent } from './modal.component';

/**
 * Pide el nombre con el que se guarda una consulta EN EL SERVIDOR. Valida lo básico (no vacío, largo) y emite
 * `confirmar`; quien lo usa hace la petición y, si el servidor rechaza (nombre repetido, por ejemplo), devuelve el
 * motivo en `errorServidor` para mostrarlo aquí sin cerrar el cuadro.
 */
@Component({
  selector: 'app-dialogo-guardar-consulta-api',
  imports: [ModalComponent],
  template: `
    <app-modal [abierto]="abierto()" titulo="Guardar consulta" (cerrar)="cerrar.emit()">
      <form (submit)="enviar($event)" novalidate>
        <label class="campo">
          <span>Nombre de la consulta</span>
          <input
            type="text"
            autocomplete="off"
            [maxLength]="largoMax"
            [value]="nombre()"
            [attr.aria-invalid]="mensaje() ? 'true' : null"
            [attr.aria-describedby]="mensaje() ? 'error-nombre-api' : null"
            placeholder="Ej.: Heredia de noche, 2024"
            (input)="alEscribir($event)"
          />
        </label>
        @if (mensaje()) {
          <p id="error-nombre-api" class="error" role="alert">{{ mensaje() }}</p>
        }
        @if (resumen().length) {
          <p class="rotulo">Filtros que se guardan</p>
          <ul class="filtros">
            @for (f of resumen(); track f) { <li>{{ f }}</li> }
          </ul>
        }
        <button type="submit" hidden>Guardar</button>
      </form>

      <div acciones>
        <button type="button" class="secundario" (click)="cerrar.emit()">Cancelar</button>
        <button type="button" class="principal" [disabled]="guardando()" (click)="enviar()">
          {{ guardando() ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .campo { display: block; margin-top: 0.4rem; }
    .campo span, .rotulo { display: block; margin-bottom: 4px; font-size: 0.8rem; font-weight: 600; color: var(--gris); }
    input { width: 100%; padding: 9px 10px; font: inherit; border: 1px solid var(--borde); border-radius: 8px; }
    input:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 1px; }
    input[aria-invalid='true'] { border-color: var(--rojo); }
    .error { margin: 6px 0 0; font-size: 0.82rem; color: var(--rojo); }
    .rotulo { margin-top: 1rem; }
    .filtros { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .filtros li { padding: 3px 10px; font-size: 0.78rem; background: #e8f0fc; border-radius: 999px; color: var(--azul); }
    button { padding: 8px 16px; font: inherit; font-weight: 600; border-radius: 8px; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    button:disabled { opacity: 0.6; cursor: default; }
    .secundario { color: var(--gris); background: #fff; border: 1px solid var(--borde); }
    .principal { color: #fff; background: var(--azul-claro); border: 1px solid var(--azul-claro); }
  `,
})
export class DialogoGuardarConsultaApiComponent {
  readonly abierto = input(false);
  /** Frases con los filtros que se van a guardar */
  readonly resumen = input<readonly string[]>([]);
  /** Motivo con el que el servidor rechazó el guardado (nombre repetido, etc.) */
  readonly errorServidor = input<string | null>(null);
  readonly guardando = input(false);

  readonly confirmar = output<string>();
  readonly cerrar = output<void>();

  protected readonly largoMax = LARGO_MAX_NOMBRE_API;
  protected readonly nombre = signal('');
  private readonly errorLocal = signal<string | null>(null);
  protected readonly mensaje = () => this.errorLocal() ?? this.errorServidor();

  constructor() {
    // Cada vez que se abre, se empieza con el campo limpio
    effect(() => {
      if (this.abierto()) {
        untracked(() => {
          this.nombre.set('');
          this.errorLocal.set(null);
        });
      }
    });
  }

  protected alEscribir(e: Event): void {
    this.nombre.set((e.target as HTMLInputElement).value);
    this.errorLocal.set(null);
  }

  protected enviar(e?: Event): void {
    e?.preventDefault();
    const limpio = this.nombre().trim();
    if (!limpio) {
      this.errorLocal.set('Escriba un nombre para la consulta.');
      return;
    }
    if (limpio.length > this.largoMax) {
      this.errorLocal.set(`El nombre no puede pasar de ${this.largoMax} caracteres.`);
      return;
    }
    this.confirmar.emit(limpio);
  }
}
