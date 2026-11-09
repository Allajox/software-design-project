import { Component, computed, input, output } from '@angular/core';
import { ItemConteo } from '../../../core/services/estadisticas.service';
import { fmtEntero, fmtPct } from '../../../shared/utils/formato';
import { PALETA } from '../../../shared/utils/paleta';

/** Hueco entre segmentos, en unidades de circunferencia (100 = vuelta completa) */
const HUECO = 0.6;

/**
 * Gráfico de dona con leyenda. Los segmentos son del mismo azul en tres pasos ordenados
 * (más oscuro = más grave). La leyenda son botones: sirven para filtrar con el teclado.
 */
@Component({
  selector: 'app-dona',
  template: `
    <div class="dona">
      <div class="aro">
        <svg viewBox="0 0 42 42" role="img" [attr.aria-label]="ariaLabel()">
          <circle class="fondo" cx="21" cy="21" r="15.9155" />
          <g transform="rotate(-90 21 21)">
            @for (s of segmentos(); track s.clave) {
              <circle
                class="segmento"
                cx="21" cy="21" r="15.9155"
                [attr.stroke]="s.color"
                [attr.stroke-dasharray]="s.longitud + ' ' + (100 - s.longitud)"
                [attr.stroke-dashoffset]="-s.desplazamiento"
                [style.opacity]="s.atenuado ? 0.3 : 1"
                (click)="seleccionar.emit(s.clave)"
              >
                <title>{{ s.etiqueta }}: {{ s.textoValor }} ({{ s.textoPct }})</title>
              </circle>
            }
          </g>
        </svg>
        <div class="centro">
          <strong>{{ textoTotal() }}</strong>
          <span>siniestros</span>
        </div>
      </div>

      <ul class="leyenda">
        @for (s of segmentos(); track s.clave) {
          <li>
            <button
              type="button"
              [class.atenuado]="s.atenuado"
              [class.seleccionado]="s.seleccionado"
              [attr.aria-pressed]="s.seleccionado"
              (click)="seleccionar.emit(s.clave)"
            >
              <span class="muestra" [style.background]="s.color"></span>
              <span class="nombre">{{ s.etiqueta }}</span>
              <span class="cifra">{{ s.textoValor }}</span>
              <span class="pct">{{ s.textoPct }}</span>
            </button>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .dona { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.6rem; justify-content: center; }
    .aro { position: relative; width: 170px; height: 170px; flex-shrink: 0; }
    svg { width: 100%; height: 100%; }
    circle { fill: none; stroke-width: 6.5; }
    .fondo { stroke: var(--rejilla); opacity: 0.55; }
    .segmento { cursor: pointer; transition: opacity 0.2s; }
    .centro {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .centro strong { font-size: 1.45rem; font-weight: 600; color: var(--tinta); font-variant-numeric: tabular-nums; }
    .centro span { font-size: 0.75rem; color: var(--tinta-2); }
    .leyenda { list-style: none; margin: 0; padding: 0; min-width: 210px; flex: 1; max-width: 300px; }
    button {
      display: grid;
      grid-template-columns: 12px 1fr auto 54px;
      align-items: center;
      column-gap: 9px;
      width: 100%;
      padding: 6px 8px;
      font: inherit;
      font-size: 0.86rem;
      text-align: left;
      color: var(--tinta);
      background: none;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover { background: var(--fondo); }
    button:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: -2px; }
    button.seleccionado { background: #e8f0fc; }
    button.atenuado { color: var(--tinta-3); }
    .muestra { width: 12px; height: 12px; border-radius: 3px; }
    .cifra, .pct { text-align: right; font-variant-numeric: tabular-nums; }
    .pct { color: var(--tinta-2); }
  `,
})
export class DonaComponent {
  readonly items = input.required<readonly ItemConteo[]>();
  readonly seleccionadas = input<readonly string[]>([]);
  readonly ariaLabel = input.required<string>();
  readonly seleccionar = output<string>();

  protected readonly total = computed(() => this.items().reduce((suma, i) => suma + i.valor, 0));
  protected readonly textoTotal = computed(() => fmtEntero(this.total()));

  protected readonly segmentos = computed(() => {
    const items = this.items();
    const sel = this.seleccionadas();
    const conDatos = items.filter((i) => i.valor > 0).length;
    // Si solo hay un segmento no se deja hueco: sería un corte sin sentido en el aro
    const hueco = conDatos > 1 ? HUECO : 0;
    let acumulado = 0;
    return items.map((i) => {
      const seleccionado = sel.includes(i.etiqueta);
      const segmento = {
        clave: i.etiqueta,
        etiqueta: i.etiqueta,
        color: PALETA.severidad[i.etiqueta] ?? PALETA.serie1,
        longitud: i.valor > 0 ? Math.max(i.porcentaje - hueco, 0.1) : 0,
        desplazamiento: acumulado + hueco / 2,
        textoValor: fmtEntero(i.valor),
        textoPct: fmtPct(i.porcentaje),
        seleccionado,
        atenuado: sel.length > 0 && !seleccionado,
      };
      acumulado += i.porcentaje;
      return segmento;
    });
  });
}
