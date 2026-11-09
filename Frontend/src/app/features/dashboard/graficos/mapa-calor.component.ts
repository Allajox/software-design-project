import { Component, computed, input, output } from '@angular/core';
import { MatrizDiaFranja } from '../../../core/services/estadisticas.service';
import { fmtEntero, fmtPct } from '../../../shared/utils/formato';
import { PALETA } from '../../../shared/utils/paleta';

/**
 * Mapa de calor día de la semana × franja horaria. La intensidad (un solo azul, de claro a
 * oscuro) indica cuántos siniestros hay; cada celda además escribe su número, así que el color
 * no es lo único que transmite el dato. Los encabezados de fila y columna filtran por día/franja.
 */
@Component({
  selector: 'app-mapa-calor',
  template: `
    <div class="mapa" role="group" [attr.aria-label]="ariaLabel()">
      <span></span>
      @for (franja of matriz().franjas; track franja) {
        <button
          type="button"
          class="cab"
          [class.seleccionada]="franjasSel().includes(franja)"
          [attr.aria-pressed]="soloLectura() ? null : franjasSel().includes(franja)"
          [disabled]="soloLectura()"
          (click)="alternarFranja.emit(franja)"
        >
          {{ franja }}
        </button>
      }

      @for (fila of celdas(); track fila.dia) {
        <button
          type="button"
          class="cab dia"
          [class.seleccionada]="diasSel().includes(fila.dia)"
          [attr.aria-pressed]="soloLectura() ? null : diasSel().includes(fila.dia)"
          [disabled]="soloLectura()"
          (click)="alternarDia.emit(fila.dia)"
        >
          {{ fila.dia }}
        </button>
        @for (c of fila.celdas; track c.franja) {
          <div
            class="celda"
            [style.background]="c.fondo"
            [style.color]="c.texto"
            [attr.data-tip]="c.tip"
          >
            {{ c.valor }}
          </div>
        }
      }
    </div>

    <div class="escala" aria-hidden="true">
      <span>Menos</span>
      @for (color of paso; track color) {
        <span class="paso" [style.background]="color"></span>
      }
      <span>Más (máx. {{ maximoTexto() }})</span>
    </div>
  `,
  styles: `
    .mapa {
      display: grid;
      grid-template-columns: 92px repeat(4, minmax(0, 1fr));
      gap: 2px;
      align-items: stretch;
    }
    .cab {
      padding: 6px 4px;
      font: inherit;
      font-size: 0.78rem;
      color: var(--tinta-2);
      background: none;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
    }
    .cab.dia { text-align: left; padding-left: 8px; }
    .cab:hover:not(:disabled) { background: var(--fondo); }
    .cab:disabled { cursor: default; color: var(--tinta-2); }
    .cab:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: -2px; }
    .cab.seleccionada { background: #e8f0fc; color: var(--tinta); font-weight: 600; }
    .celda {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
      border-radius: 4px;
    }
    .escala {
      display: flex; align-items: center; gap: 4px;
      margin-top: 0.9rem; font-size: 0.74rem; color: var(--tinta-2);
    }
    .escala span:first-child { margin-right: 4px; }
    .escala span:last-child { margin-left: 4px; }
    .paso { width: 22px; height: 10px; border-radius: 2px; }

    /* En celular los encabezados se achican para que "Madrugada" no pise a "Mañana" */
    @media (max-width: 520px) {
      .mapa { grid-template-columns: 62px repeat(4, minmax(0, 1fr)); }
      .cab { font-size: 0.68rem; padding: 6px 0; overflow: hidden; text-overflow: ellipsis; }
      .cab.dia { padding-left: 4px; }
      .celda { font-size: 0.74rem; }
    }
  `,
})
export class MapaCalorComponent {
  readonly matriz = input.required<MatrizDiaFranja>();
  readonly diasSel = input<readonly string[]>([]);
  readonly franjasSel = input<readonly string[]>([]);
  readonly ariaLabel = input.required<string>();
  /** Sin filtros: los encabezados son solo texto (p. ej. al mostrar un tramo de carretera) */
  readonly soloLectura = input(false);
  readonly alternarDia = output<string>();
  readonly alternarFranja = output<string>();

  protected readonly paso = PALETA.secuencial;
  protected readonly maximoTexto = computed(() => fmtEntero(this.matriz().maximo));

  protected readonly celdas = computed(() => {
    const m = this.matriz();
    const total = m.valores.flat().reduce((a, b) => a + b, 0);
    const pasos = PALETA.secuencial.length;
    return m.dias.map((dia, i) => ({
      dia,
      celdas: m.franjas.map((franja, j) => {
        const valor = m.valores[i][j];
        // valor 0 -> color "vacío"; el resto se reparte en 7 tramos de 1/7 del máximo
        const tramo = valor === 0 || m.maximo === 0 ? -1 : Math.min(pasos - 1, Math.ceil((valor / m.maximo) * pasos) - 1);
        return {
          franja,
          valor: fmtEntero(valor),
          fondo: tramo < 0 ? PALETA.vacio : PALETA.secuencial[tramo],
          // fondos oscuros llevan texto blanco; los claros, texto oscuro
          texto: tramo >= 4 ? '#ffffff' : '#0b0b0b',
          tip: `${dia} · ${franja}\n${fmtEntero(valor)} siniestros (${fmtPct(total > 0 ? (valor / total) * 100 : 0)})`,
        };
      }),
    }));
  });
}
