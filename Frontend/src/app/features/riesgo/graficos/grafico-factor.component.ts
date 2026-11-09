import { Component, computed, input, output } from '@angular/core';
import { Estimacion, Factor, TEXTO_NIVEL_VIAL } from '../../../core/analisis/riesgo';
import { Escala, posicion } from '../../../shared/utils/escala';
import { fmtDec1, fmtDec2, fmtEntero, fmtPct } from '../../../shared/utils/formato';
import { PALETA } from '../../../shared/utils/paleta';

/**
 * «Curva» de un factor: cómo cambia el índice de riesgo al mover SOLO ese factor (los otros dos quedan
 * como en el escenario elegido). Barras horizontales (los nombres de clima son largos) con la MISMA escala
 * en los tres factores, para poder comparar un factor con otro. Tocar una barra elige ese valor.
 */
@Component({
  selector: 'app-grafico-factor',
  template: `
    <section class="factor" [attr.aria-label]="titulo()">
      <h3>{{ titulo() }}</h3>
      <ul class="filas">
        @for (f of filas(); track f.nivel) {
          <li>
            <button type="button" class="fila" [class.elegida]="f.elegida" [attr.aria-pressed]="f.elegida"
                    [attr.data-tip]="f.tip" (click)="elegir.emit(f.nivel)">
              <span class="nombre">{{ f.nivel }}</span>
              <span class="pista">
                <span class="ref" [style.left.%]="posRef()"></span>
                <span class="barra" [style.width.%]="f.ancho" [style.background]="f.color"></span>
              </span>
              <span class="valor">{{ f.valor }}</span>
            </button>
          </li>
        }
      </ul>
      <div class="eje" aria-hidden="true">
        <span></span>
        <span class="ticks">
          @for (t of ticks(); track t.valor) {
            <span class="tic" [style.left.%]="t.pos">{{ t.texto }}</span>
          }
        </span>
        <span></span>
      </div>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    h3 { margin: 0 0 6px; font-size: 0.86rem; font-weight: 600; color: var(--tinta); }
    .filas { margin: 0; padding: 0; list-style: none; }
    .fila {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr) 46px;
      align-items: center;
      column-gap: 8px;
      width: 100%;
      padding: 3px 4px;
      font: inherit;
      font-size: 0.8rem;
      color: var(--tinta-2);
      text-align: left;
      background: none;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
    }
    .fila:hover { background: var(--fondo); }
    .fila:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 1px; }
    .fila.elegida { color: var(--tinta); font-weight: 600; background: #eef4fd; border-color: #b9d3f5; }
    .nombre { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pista { position: relative; display: block; height: 14px; }
    .barra { position: absolute; left: 0; top: 2px; height: 10px; border-radius: 0 4px 4px 0; min-width: 2px; }
    .ref { position: absolute; top: -2px; bottom: -2px; width: 0; border-left: 1px dashed var(--tinta-2); z-index: 1; }
    .valor { text-align: right; font-variant-numeric: tabular-nums; }
    .eje { display: grid; grid-template-columns: 84px minmax(0, 1fr) 46px; column-gap: 8px; padding: 0 4px; margin-top: 2px; }
    .ticks { position: relative; display: block; height: 14px; font-size: 0.68rem; color: var(--tinta-3); }
    .tic { position: absolute; top: 0; transform: translateX(-50%); font-variant-numeric: tabular-nums; }
    .tic:first-child { transform: none; }
  `,
})
export class GraficoFactorComponent {
  readonly titulo = input.required<string>();
  readonly factor = input.required<Factor>();
  /** una estimación por cada valor del factor, en el orden del catálogo */
  readonly estimaciones = input.required<readonly Estimacion[]>();
  readonly escala = input.required<Escala>();
  readonly seleccionado = input.required<string>();
  readonly elegir = output<string>();

  protected readonly posRef = computed(() => posicion(1, this.escala()));

  protected readonly filas = computed(() => {
    const factor = this.factor();
    const escala = this.escala();
    return this.estimaciones().map((e) => {
      const nivel = e.escenario[factor] as string;
      const elegida = nivel === this.seleccionado();
      return {
        nivel,
        elegida,
        ancho: Math.max(0, posicion(e.indice, escala)),
        color: elegida ? PALETA.serie1 : PALETA.secuencial[1],
        valor: `${fmtDec1(e.indice)}×`,
        tip:
          `${nivel}: riesgo ${TEXTO_NIVEL_VIAL[e.nivel].toLowerCase()}\n` +
          `Índice ${fmtDec1(e.indice)}× el promedio\n` +
          `Frecuencia ${fmtDec2(e.frecuencia)}× · ${fmtPct(e.pGrave * 100)} graves o mortales\n` +
          `${fmtEntero(e.soporte)} siniestros observados con esta combinación`,
      };
    });
  });

  protected readonly ticks = computed(() =>
    this.escala().ticks.map((valor) => ({ valor, pos: posicion(valor, this.escala()), texto: fmtDec1(valor).replace(',0', '') })),
  );
}
