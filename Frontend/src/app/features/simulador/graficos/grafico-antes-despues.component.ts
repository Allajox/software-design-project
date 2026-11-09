import { Component, computed, input } from '@angular/core';
import { fmtDec1, fmtDec2 } from '../../../shared/utils/formato';
import { PALETA } from '../../../shared/utils/paleta';

export interface FilaAntesDespues {
  nombre: string;
  /** valor de hoy (por año) */
  hoy: number;
  /** valor con el efecto central */
  despues: number;
  /** valor con el efecto máximo (el más bajo que quedaría) */
  despuesMin: number;
  /** valor con el efecto mínimo (el más alto que quedaría) */
  despuesMax: number;
}

const cifra = (n: number): string => (n < 1 ? fmtDec2(n) : fmtDec1(n));

/**
 * «Hoy» frente a «con las medidas», una fila por indicador. Cada fila tiene su propia escala (hoy = 100 %) porque
 * los indicadores no son comparables entre sí (siniestros, heridos, fallecidos): no es un eje doble, son tres gráficos chicos.
 * Las barras parten de cero; la línea con topes marca el rango entre el efecto mínimo y el máximo.
 */
@Component({
  selector: 'app-grafico-antes-despues',
  template: `
    <div class="filas">
      @for (f of vista(); track f.nombre) {
        <div class="fila">
          <h3>{{ f.nombre }} <span class="unidad">por año</span></h3>
          <div class="linea" [attr.data-tip]="f.tipHoy" data-tip-izq tabindex="0">
            <span class="etq">Hoy</span>
            <span class="pista"><span class="barra hoy" style="width: 100%"></span></span>
            <span class="val">{{ f.textoHoy }}</span>
          </div>
          <div class="linea" [attr.data-tip]="f.tipDespues" data-tip-izq tabindex="0">
            <span class="etq">Con medidas</span>
            <span class="pista">
              <span class="barra despues" [style.width.%]="f.pDespues"></span>
              <span class="rango" [style.left.%]="f.pMin" [style.width.%]="f.pMax - f.pMin"></span>
            </span>
            <span class="val">{{ f.textoDespues }}</span>
          </div>
        </div>
      }
    </div>
    <ul class="leyenda">
      <li><span class="m-barra hoy"></span> Hoy</li>
      <li><span class="m-barra despues"></span> Con las medidas (efecto central)</li>
      <li><span class="m-rango"></span> Rango entre el efecto mínimo y el máximo</li>
    </ul>
  `,
  styles: `
    :host { display: block; }
    .filas { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.1rem 2rem; }
    h3 { margin: 0 0 4px; font-size: 0.86rem; font-weight: 600; color: var(--tinta); }
    .unidad { font-weight: 400; color: var(--tinta-3); }
    .linea {
      display: grid;
      grid-template-columns: 82px minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 8px;
      padding: 3px 4px;
      border-radius: 6px;
      font-size: 0.8rem;
      color: var(--tinta-2);
    }
    .linea:hover { background: var(--fondo); }
    .linea:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 1px; }
    .pista { position: relative; display: block; height: 16px; }
    .barra { position: absolute; left: 0; top: 2px; height: 12px; border-radius: 0 4px 4px 0; min-width: 2px; }
    .barra.hoy { background: ${PALETA.atenuado}; }
    .barra.despues { background: ${PALETA.serie1}; }
    .rango { position: absolute; top: 50%; height: 0; border-top: 2px solid var(--tinta); transform: translateY(-1px); min-width: 1px; }
    .rango::before, .rango::after { content: ''; position: absolute; top: -5px; height: 10px; border-left: 2px solid var(--tinta); }
    .rango::before { left: 0; }
    .rango::after { right: -1px; }
    .val { min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; color: var(--tinta); font-weight: 600; }
    .leyenda { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0.9rem 0 0; padding: 0; list-style: none; font-size: 0.78rem; color: var(--tinta-2); }
    .leyenda li { display: inline-flex; align-items: center; gap: 6px; }
    .m-barra { display: inline-block; width: 16px; height: 10px; border-radius: 2px; }
    .m-barra.hoy { background: ${PALETA.atenuado}; }
    .m-barra.despues { background: ${PALETA.serie1}; }
    .m-rango { display: inline-block; width: 18px; height: 0; border-top: 2px solid var(--tinta); }
  `,
})
export class GraficoAntesDespuesComponent {
  readonly filas = input.required<readonly FilaAntesDespues[]>();

  protected readonly vista = computed(() =>
    this.filas().map((f) => {
      const p = (v: number) => (f.hoy > 0 ? Math.max(0, Math.min(100, (v / f.hoy) * 100)) : 0);
      const baja = f.hoy > 0 ? (1 - f.despues / f.hoy) * 100 : 0;
      return {
        nombre: f.nombre,
        textoHoy: cifra(f.hoy),
        textoDespues: cifra(f.despues),
        pDespues: p(f.despues),
        pMin: p(f.despuesMin),
        pMax: p(f.despuesMax),
        tipHoy: `${f.nombre}, hoy: ${cifra(f.hoy)} por año`,
        tipDespues:
          `${f.nombre} con las medidas: ${cifra(f.despues)} por año (${fmtDec1(baja)} % menos)\n` +
          `Rango: de ${cifra(f.despuesMin)} a ${cifra(f.despuesMax)}`,
      };
    }),
  );
}
