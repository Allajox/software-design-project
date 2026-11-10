import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { fmtEntero } from '../../../shared/utils/formato';

/** Una serie de barras: un valor por categoría, todas del mismo color (salvo que se pase `colores`). */
export interface SerieColumnas {
  nombre: string;
  color: string;
  valores: readonly number[];
}

/** Barra sobre la que se hizo clic */
export interface BarraElegida {
  categoria: string;
  serie: string;
}

/**
 * Gráfico de columnas verticales (Pareto de rutas, víctimas por género y edad, tasa de fatalidad por vehículo).
 * Con una serie cada barra puede llevar su propio color (`colores`); con varias, las barras de cada categoría van
 * juntas y la leyenda escribe el nombre de cada serie, así que el color nunca es lo único que dice qué es cada una.
 * Cada barra escribe su valor encima y, al pasar el mouse o enfocarla, muestra un detalle. Con `seleccionable` las
 * barras son botones que avisan cuál se eligió (para filtrar el panel).
 */
@Component({
  selector: 'app-columnas',
  template: `
    @if (series().length > 1) {
      <ul class="leyenda" aria-hidden="true">
        @for (s of series(); track s.nombre) {
          <li><span class="muestra" [style.background]="s.color"></span>{{ s.nombre }}</li>
        }
      </ul>
    }

    <div class="grafico" role="group" [attr.aria-label]="ariaLabel()" [style.--alto.px]="alto()">
      @for (categoria of categorias(); track categoria; let i = $index) {
        <div class="grupo" [style.min-width.px]="anchoMinimo()">
          <div class="barras">
            @for (s of series(); track s.nombre) {
              @let valor = s.valores[i] ?? 0;
              @let tip = detalleDe(categoria, s, valor);
              @if (seleccionable()) {
                <button
                  type="button"
                  class="barra"
                  [class.elegida]="seleccionadas().includes(categoria)"
                  [class.atenuada]="seleccionadas().length > 0 && !seleccionadas().includes(categoria)"
                  [style.height.%]="altura(valor)"
                  [style.background]="colorDe(s, i)"
                  [attr.aria-pressed]="seleccionadas().includes(categoria)"
                  [attr.aria-label]="tip.replace('\\n', ': ')"
                  [attr.data-tip]="tip"
                  (click)="seleccionar.emit({ categoria, serie: s.nombre })"
                >
                  <span class="valor">{{ formato()(valor) }}</span>
                </button>
              } @else {
                <div
                  class="barra"
                  role="img"
                  tabindex="0"
                  [style.height.%]="altura(valor)"
                  [style.background]="colorDe(s, i)"
                  [attr.aria-label]="tip.replace('\\n', ': ')"
                  [attr.data-tip]="tip"
                >
                  <span class="valor">{{ formato()(valor) }}</span>
                </div>
              }
            }
          </div>
          <span class="etiqueta" [attr.title]="categoria">{{ etiquetasCortas()?.[i] ?? categoria }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .leyenda { display: flex; flex-wrap: wrap; gap: 0.3rem 1.1rem; margin: 0 0 0.5rem; padding: 0; list-style: none; font-size: 0.85rem; color: var(--tinta-2); }
    .muestra { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border-radius: 2px; vertical-align: -1px; }
    .grafico { display: flex; gap: 6px; align-items: stretch; padding-top: 1.3rem; }
    .grupo { flex: 1 1 0; display: flex; flex-direction: column; min-width: 0; }
    .barras {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 2px;
      height: var(--alto, 220px);
      border-bottom: 1px solid var(--tinta);
    }
    .barra {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      max-width: 72px;
      min-height: 2px;
      padding: 0;
      border: 0;
      border-radius: 2px 2px 0 0;
      font: inherit;
    }
    button.barra { cursor: pointer; }
    .barra:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .barra.atenuada { opacity: 0.45; }
    .barra.elegida { outline: 2px solid var(--tinta); outline-offset: 1px; }
    .barra:hover { filter: brightness(1.08); }
    .valor {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      padding-bottom: 2px;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--tinta);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .etiqueta {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: 6px;
      font-size: 0.76rem;
      line-height: 1.2;
      text-align: center;
      color: var(--tinta-2);
      overflow-wrap: break-word;
    }

    /* En celular hay menos ancho por barra: texto un poco menor para que «Peatón» o «31 879» no se partan */
    @media (max-width: 520px) {
      .grafico { gap: 3px; }
      .etiqueta { font-size: 0.68rem; }
      .valor { font-size: 0.66rem; }
    }
  `,
})
export class ColumnasComponent {
  readonly categorias = input.required<readonly string[]>();
  readonly series = input.required<readonly SerieColumnas[]>();
  readonly ariaLabel = input.required<string>();
  /** Texto corto bajo cada barra (por ejemplo «R27» en lugar de «Ruta 27»); si falta, se escribe la categoría. */
  readonly etiquetasCortas = input<readonly string[] | null>(null);
  /** Un color por categoría; solo tiene efecto con una serie */
  readonly colores = input<readonly string[] | null>(null);
  readonly formato = input<(valor: number) => string>(fmtEntero);
  /** Texto del detalle de cada barra («Ruta 2\\n5 144 siniestros»); por omisión, categoría y valor. */
  readonly detalle = input<((categoria: string, serie: string, valor: number) => string) | null>(null);
  readonly seleccionable = input(false, { transform: booleanAttribute });
  readonly seleccionadas = input<readonly string[]>([]);
  readonly alto = input(220);
  readonly anchoMinimo = input(0);

  readonly seleccionar = output<BarraElegida>();

  private readonly maximo = computed(() => Math.max(1, ...this.series().flatMap((s) => s.valores)));

  protected altura(valor: number): number {
    return (Math.max(0, valor) / this.maximo()) * 100;
  }

  protected colorDe(serie: SerieColumnas, indice: number): string {
    return (this.series().length === 1 ? this.colores()?.[indice] : undefined) ?? serie.color;
  }

  protected detalleDe(categoria: string, serie: SerieColumnas, valor: number): string {
    const propio = this.detalle();
    if (propio) return propio(categoria, serie.nombre, valor);
    const nombre = this.series().length > 1 ? `${serie.nombre}: ` : '';
    return `${categoria}\n${nombre}${this.formato()(valor)}`;
  }
}
