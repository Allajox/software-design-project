import { Component, input, output } from '@angular/core';

export interface OpcionChip<T> {
  valor: T;
  texto: string;
  /** Texto largo para lectores de pantalla y tooltip nativo (ej. "Enero" para "Ene") */
  descripcion?: string;
}

/**
 * Grupo de botones de selección múltiple ("chips").
 * Es genérico: sirve para años (números) y para vehículos (texto) sin cambiar nada.
 * No guarda estado: recibe lo seleccionado y avisa con `alternar` qué opción se tocó.
 */
@Component({
  selector: 'app-chips-filtro',
  template: `
    <fieldset class="grupo">
      <legend>{{ etiqueta() }}</legend>
      <div class="chips">
        @for (o of opciones(); track o.valor) {
          <button
            type="button"
            class="chip"
            [class.activo]="estaActivo(o.valor)"
            [attr.aria-pressed]="estaActivo(o.valor)"
            [attr.aria-label]="o.descripcion ?? null"
            [attr.title]="o.descripcion ?? null"
            (click)="alternar.emit(o.valor)"
          >
            {{ o.texto }}
          </button>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .grupo { margin: 0; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 6px; font-size: 0.78rem; font-weight: 600; color: var(--gris); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      padding: 4px 11px;
      font: inherit;
      font-size: 0.82rem;
      color: var(--texto);
      background: #fff;
      border: 1px solid var(--borde);
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, color 0.12s;
    }
    .chip:hover { border-color: var(--azul-claro); }
    .chip:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .chip.activo { color: #fff; background: var(--azul-claro); border-color: var(--azul-claro); }
  `,
})
export class ChipsFiltroComponent<T extends string | number> {
  readonly etiqueta = input.required<string>();
  readonly opciones = input.required<readonly OpcionChip<T>[]>();
  readonly seleccionados = input.required<readonly T[]>();
  readonly alternar = output<T>();

  protected estaActivo(valor: T): boolean {
    return this.seleccionados().includes(valor);
  }
}
