import { Component, input } from '@angular/core';

/**
 * Indicador grande del panel (Figma «Panel de indicadores»): nombre, cifra destacada y una línea de aclaración.
 * El tono «alerta» (naranja) se usa para el indicador de condiciones adversas. La fórmula se muestra al pasar el
 * mouse o al enfocar el nombre con el teclado.
 */
@Component({
  selector: 'app-indicador',
  template: `
    <article class="indicador" [class.alerta]="tono() === 'alerta'">
      <h3 class="nombre" tabindex="0" [attr.data-tip]="formula() || null">
        {{ nombre() }}
        @if (sigla()) {
          <span class="sigla">({{ sigla() }})</span>
        }
      </h3>
      <p class="valor" [attr.aria-label]="valor() + ' ' + unidad()">
        {{ valor() }}
        @if (unidad()) {
          <span class="unidad">{{ unidad() }}</span>
        }
      </p>
      <p class="detalle">{{ detalle() }}</p>
    </article>
  `,
  styles: `
    /* Dentro de una cuadrícula de indicadores (3 filas por indicador) la cifra de todos queda a la misma altura aunque
       el nombre de alguno ocupe dos líneas; fuera de una cuadrícula es un bloque normal. */
    :host { display: grid; grid-row: span 3; grid-template-rows: subgrid; row-gap: 0; }
    .indicador { display: contents; }
    .nombre {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 500;
      line-height: 1.25;
      color: var(--texto);
      width: fit-content;
      max-width: 100%;
    }
    .nombre[data-tip] { cursor: help; text-decoration: underline dotted var(--borde); text-underline-offset: 4px; }
    .nombre:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; border-radius: 4px; }
    .sigla { font-weight: 600; color: var(--gris); }
    .valor {
      margin: 0.25rem 0 0;
      font-size: 2.6rem;
      font-weight: 700;
      line-height: 1.1;
      color: var(--kpi);
      font-variant-numeric: tabular-nums;
    }
    .alerta .valor { color: var(--alerta); }
    .unidad { margin-left: 0.1rem; font-size: 1.6rem; font-weight: 600; }
    .detalle { margin: 0.3rem 0 0; font-size: 0.95rem; color: var(--gris); }
  `,
})
export class IndicadorComponent {
  readonly nombre = input.required<string>();
  readonly sigla = input<string>('');
  readonly valor = input.required<string>();
  readonly unidad = input<string>('');
  readonly detalle = input<string>('');
  readonly formula = input<string>('');
  readonly tono = input<'normal' | 'alerta'>('normal');
}
