import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Filtros } from '../../core/models/siniestro.models';
import { ConsultasService } from '../../core/services/consultas.service';
import { validarNombreConsulta, LARGO_MAX_NOMBRE } from '../../core/services/consultas';
import { resumirFiltros } from '../../core/services/filtros-resumen';
import { ModalComponent } from './modal.component';

/**
 * Pide el nombre de una consulta (para guardarla o renombrarla). Valida y, si todo está bien,
 * emite `confirmar` con el nombre; quien lo usa decide qué hacer con él.
 */
@Component({
  selector: 'app-dialogo-nombre-consulta',
  imports: [ModalComponent],
  template: `
    <app-modal [abierto]="abierto()" [titulo]="titulo()" (cerrar)="cerrar.emit()">
      <form (submit)="enviar($event)" novalidate>
        <label class="campo">
          <span>Nombre de la consulta</span>
          <input
            #entrada
            type="text"
            autofocus
            autocomplete="off"
            [maxLength]="largoMax"
            [value]="nombre()"
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? 'error-nombre' : null"
            placeholder="Ej.: Motos en Limón, 2025"
            (input)="alEscribir($event)"
          />
        </label>
        @if (error()) {
          <p id="error-nombre" class="error" role="alert">{{ error() }}</p>
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
        <button type="button" class="principal" (click)="enviar()">{{ textoBoton() }}</button>
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
    .secundario { color: var(--gris); background: #fff; border: 1px solid var(--borde); }
    .principal { color: #fff; background: var(--azul-claro); border: 1px solid var(--azul-claro); }
  `,
})
export class DialogoNombreConsultaComponent {
  private readonly consultas = inject(ConsultasService);

  readonly abierto = input(false);
  readonly titulo = input('Guardar consulta');
  readonly textoBoton = input('Guardar');
  readonly nombreInicial = input('');
  /** Filtros que se muestran como resumen (opcional: al renombrar no hacen falta) */
  readonly filtros = input<Filtros | null>(null);
  /** Consulta que se está renombrando: su propio nombre no cuenta como repetido */
  readonly idExcluido = input<string | undefined>(undefined);

  readonly confirmar = output<string>();
  readonly cerrar = output<void>();

  protected readonly largoMax = LARGO_MAX_NOMBRE;
  protected readonly nombre = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly resumen = computed(() => {
    const f = this.filtros();
    return f ? resumirFiltros(f) : [];
  });

  constructor() {
    // Cada vez que se abre, empieza limpio
    effect(() => {
      if (this.abierto()) {
        untracked(() => {
          this.nombre.set(this.nombreInicial());
          this.error.set(null);
        });
      }
    });
  }

  protected alEscribir(e: Event): void {
    this.nombre.set((e.target as HTMLInputElement).value);
    if (this.error()) this.error.set(null);
  }

  protected enviar(e?: Event): void {
    e?.preventDefault();
    const error = validarNombreConsulta(this.nombre(), this.consultas.guardadas(), this.idExcluido());
    if (error) {
      this.error.set(error);
      return;
    }
    this.confirmar.emit(this.nombre().trim());
  }
}
