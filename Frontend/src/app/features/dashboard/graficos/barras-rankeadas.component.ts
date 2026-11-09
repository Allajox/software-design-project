import { Component, computed, input, output } from '@angular/core';
import { PALETA } from '../../../shared/utils/paleta';

export interface FilaBarra {
  /** Identificador que se emite al hacer clic */
  clave: string;
  etiqueta: string;
  /** Largo de la barra (se compara contra el valor máximo) */
  valor: number;
  /** Texto del valor, ya formateado */
  texto: string;
  /** Textos de las columnas extra (una por cada encabezado en `columnasExtra`) */
  extras?: string[];
  /** Texto del tooltip */
  tip?: string;
}

/**
 * Barras horizontales ordenadas. Cada fila es un botón: al hacer clic avisa su `clave`
 * para que quien lo use la convierta en un filtro. Las filas no seleccionadas se atenúan
 * cuando hay alguna selección, pero siguen visibles para poder cambiar de opinión.
 */
@Component({
  selector: 'app-barras-rankeadas',
  template: `
    <div class="barras" role="group" [attr.aria-label]="ariaLabel()">
      @if (columnasExtra().length) {
        <div class="encabezado" aria-hidden="true">
          <span></span><span></span><span></span>
          @for (c of columnasExtra(); track c) {
            <span class="extra">{{ c }}</span>
          }
        </div>
      }
      @for (fila of vista(); track fila.clave) {
        <button
          type="button"
          class="fila"
          [class.atenuada]="fila.atenuada"
          [class.seleccionada]="fila.seleccionada"
          [attr.aria-pressed]="fila.seleccionada"
          [attr.data-tip]="fila.tip ?? null"
          data-tip-izq
          [style.grid-template-columns]="plantilla()"
          (click)="seleccionar.emit(fila.clave)"
        >
          <span class="etiqueta">{{ fila.etiqueta }}</span>
          <span class="pista"><span class="relleno" [style.width.%]="fila.ancho" [style.background]="color(fila.atenuada)"></span></span>
          <span class="valor">{{ fila.texto }}</span>
          @for (e of fila.extras ?? []; track $index) {
            <span class="extra">{{ e }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .barras { display: flex; flex-direction: column; gap: 2px; }
    .encabezado, .fila {
      display: grid;
      align-items: center;
      column-gap: 10px;
      grid-template-columns: var(--cols, 120px minmax(60px, 1fr) 64px);
    }
    .encabezado { font-size: 0.72rem; color: var(--tinta-3); padding: 0 6px; }
    .fila {
      width: 100%;
      padding: 5px 6px;
      font: inherit;
      font-size: 0.84rem;
      text-align: left;
      color: var(--tinta);
      background: none;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
    }
    .fila:hover { background: var(--fondo); }
    .fila:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: -2px; }
    .fila.seleccionada { background: #e8f0fc; }
    .fila.atenuada .etiqueta, .fila.atenuada .valor, .fila.atenuada .extra { color: var(--tinta-3); }
    .etiqueta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pista { display: block; height: 14px; }
    .relleno { display: block; height: 100%; min-width: 2px; border-radius: 0 4px 4px 0; transition: width 0.25s ease; }
    .valor, .extra { text-align: right; font-variant-numeric: tabular-nums; }
    .extra { color: var(--tinta-2); }
    .encabezado .extra { color: var(--tinta-3); }
  `,
  host: { '[style.--cols]': 'plantilla()' },
})
export class BarrasRankeadasComponent {
  readonly filas = input.required<readonly FilaBarra[]>();
  /** Claves actualmente seleccionadas (filtro activo) */
  readonly seleccionadas = input<readonly string[]>([]);
  /** Encabezados de columnas adicionales a la derecha del valor */
  readonly columnasExtra = input<readonly string[]>([]);
  readonly ariaLabel = input.required<string>();
  /** Ancho de la columna de etiquetas */
  readonly anchoEtiqueta = input('130px');
  readonly seleccionar = output<string>();

  protected readonly plantilla = computed(
    () =>
      `minmax(0, ${this.anchoEtiqueta()}) minmax(20px, 1fr) 56px ${this.columnasExtra().map(() => '60px').join(' ')}`.trim(),
  );

  protected readonly vista = computed(() => {
    const filas = this.filas();
    const maximo = Math.max(0, ...filas.map((f) => f.valor));
    const sel = this.seleccionadas();
    return filas.map((f) => {
      const seleccionada = sel.includes(f.clave);
      return {
        ...f,
        seleccionada,
        atenuada: sel.length > 0 && !seleccionada,
        ancho: maximo > 0 ? (f.valor / maximo) * 100 : 0,
      };
    });
  });

  protected color(atenuada: boolean): string {
    return atenuada ? PALETA.atenuado : PALETA.serie1;
  }
}
