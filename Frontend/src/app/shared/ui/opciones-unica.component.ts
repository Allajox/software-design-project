import { Component, input, output } from '@angular/core';

/**
 * Grupo de botones de selección ÚNICA (como chips). Por dentro son botones de radio nativos,
 * así las flechas del teclado y los lectores de pantalla funcionan sin trabajo extra.
 * No guarda estado: recibe el valor elegido y avisa con `cambio` cuando se toca otro.
 */
@Component({
  selector: 'app-opciones-unica',
  template: `
    <fieldset class="grupo">
      <legend>{{ etiqueta() }}</legend>
      <div class="opciones">
        @for (o of opciones(); track o) {
          <label class="opcion" [class.activa]="o === valor()">
            <input type="radio" [attr.name]="etiqueta()" [value]="o" [checked]="o === valor()" (change)="cambio.emit(o)" />
            {{ o }}
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .grupo { margin: 0; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 6px; font-size: 0.78rem; font-weight: 600; color: var(--gris); }
    .opciones { display: flex; flex-wrap: wrap; gap: 6px; }
    .opcion {
      position: relative;
      padding: 5px 12px;
      font-size: 0.84rem;
      color: var(--texto);
      background: #fff;
      border: 1px solid var(--borde);
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
    }
    .opcion input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
    .opcion:hover { border-color: var(--azul-claro); }
    .opcion:has(input:focus-visible) { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .opcion.activa { color: #fff; font-weight: 600; background: var(--azul-claro); border-color: var(--azul-claro); }
  `,
})
export class OpcionesUnicaComponent {
  readonly etiqueta = input.required<string>();
  readonly opciones = input.required<readonly string[]>();
  readonly valor = input.required<string>();
  readonly cambio = output<string>();
}
