import { Component, input } from '@angular/core';

/** Tarjeta de un indicador clave (RF-3): sigla, nombre, valor grande y una línea de detalle. */
@Component({
  selector: 'app-tarjeta-kpi',
  template: `
    <article class="kpi">
      <header>
        <span class="sigla" tabindex="0" [attr.data-tip]="formula()">{{ sigla() }}</span>
        <span class="nombre">{{ nombre() }}</span>
      </header>
      <p class="valor">
        {{ valor() }}
        @if (unidad()) {
          <span class="unidad">{{ unidad() }}</span>
        }
      </p>
      <p class="detalle">{{ detalle() }}</p>
    </article>
  `,
  styles: `
    :host { display: block; }
    .kpi {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 0.9rem 1.1rem 1rem;
      background: #fff;
      border: 1px solid var(--borde);
      border-radius: 12px;
    }
    header { display: flex; flex-direction: column; gap: 2px; }
    .sigla {
      align-self: flex-start;
      padding: 1px 8px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 1px;
      color: var(--azul-claro);
      background: #e8f0fc;
      border-radius: 6px;
      cursor: help;
    }
    .sigla:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .nombre { font-size: 0.84rem; color: var(--gris); }
    .valor {
      margin: 0.6rem 0 0;
      font-size: 2rem;
      font-weight: 600;
      line-height: 1.1;
      color: var(--azul);
      font-variant-numeric: tabular-nums;
    }
    .unidad { font-size: 0.95rem; font-weight: 500; color: var(--gris); }
    .detalle { margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--gris); }
  `,
})
export class TarjetaKpiComponent {
  readonly sigla = input.required<string>();
  readonly nombre = input.required<string>();
  readonly valor = input.required<string>();
  readonly unidad = input<string>('');
  readonly detalle = input<string>('');
  /** Fórmula, se muestra al pasar el mouse o enfocar la sigla */
  readonly formula = input<string>('');
}
