import { Component, input } from '@angular/core';

/**
 * Marco común de cada gráfico: título, subtítulo, el gráfico (contenido) y,
 * opcionalmente, una "Ver como tabla" con los mismos datos (alternativa accesible).
 */
@Component({
  selector: 'app-tarjeta-grafico',
  template: `
    <section class="tarjeta">
      <header>
        <h2>{{ titulo() }}</h2>
        @if (subtitulo()) {
          <p>{{ subtitulo() }}</p>
        }
      </header>

      <div class="grafico">
        <ng-content />
      </div>

      <details class="tabla">
        <summary>Ver como tabla</summary>
        <ng-content select="app-tabla-datos" />
      </details>
    </section>
  `,
  styles: `
    :host { display: block; }
    .tarjeta {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 1rem 1.1rem 0.7rem;
      background: #fff;
      border: 1px solid var(--borde);
      border-radius: 12px;
    }
    h2 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--tinta); }
    header p { margin: 2px 0 0; font-size: 0.8rem; color: var(--tinta-2); }
    .grafico { flex: 1; display: flex; flex-direction: column; margin-top: 0.9rem; }
    .tabla { margin-top: 0.8rem; font-size: 0.8rem; color: var(--tinta-2); }
    summary { cursor: pointer; padding: 4px 0; width: fit-content; }
    summary:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
  `,
})
export class TarjetaGraficoComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');
}
