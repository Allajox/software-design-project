import { Component, input } from '@angular/core';

/** Los mismos datos del gráfico en forma de tabla: para lectores de pantalla y para copiar cifras. */
@Component({
  selector: 'app-tabla-datos',
  template: `
    <div class="envoltorio">
      <table>
        <caption class="solo-lectores">{{ descripcion() }}</caption>
        <thead>
          <tr>
            @for (c of columnas(); track $index) {
              <th scope="col" [class.num]="$index > 0">{{ c }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (fila of filas(); track $index) {
            <tr>
              @for (celda of fila; track $index) {
                @if ($index === 0) {
                  <th scope="row">{{ celda }}</th>
                } @else {
                  <td class="num">{{ celda }}</td>
                }
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .envoltorio { overflow-x: auto; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--rejilla); }
    th { font-weight: 600; color: var(--tinta); }
    tbody th { font-weight: 400; }
    .num { text-align: right; }
    .solo-lectores {
      position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
    }
  `,
})
export class TablaDatosComponent {
  readonly descripcion = input.required<string>();
  readonly columnas = input.required<readonly string[]>();
  readonly filas = input.required<readonly (readonly string[])[]>();
}
