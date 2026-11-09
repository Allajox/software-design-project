import { Component, computed, input, output } from '@angular/core';
import { Escenario, Estimacion, TEXTO_NIVEL_VIAL, describirEscenario } from '../../../core/analisis/riesgo';
import { escalaNice, posicion } from '../../../shared/utils/escala';
import { fmtDec1, fmtDec2, fmtEntero, fmtPct } from '../../../shared/utils/formato';
import { PALETA } from '../../../shared/utils/paleta';

const DIAMETRO_MIN = 8;
const DIAMETRO_HUECO = 12;
const DIAMETRO_MAX = 26;

/**
 * Las 60 combinaciones posibles (5 climas × 3 calzadas × 4 franjas) en un solo plano:
 *   horizontal = qué tan frecuentes son los siniestros (× el promedio)
 *   vertical   = qué tan probable es que un siniestro sea grave o mortal
 *   tamaño     = cuántos siniestros reales hay con esa combinación
 * Las líneas punteadas marcan el promedio. Círculo hueco = no hay ningún caso real: el punto es pura estimación del modelo.
 * Los puntos son botones HTML (así llevan tooltip); para el teclado está la tabla de abajo con un botón «Elegir» por fila.
 */
@Component({
  selector: 'app-grafico-dispersion',
  template: `
    <div class="marco">
      <p class="eje-y-titulo">↑ Probabilidad de que un siniestro sea grave o mortal</p>

      <div class="cuerpo">
        <div class="eje-y" aria-hidden="true">
          @for (t of ejeY().ticks; track t) {
            <span class="tic-y" [style.bottom.%]="posY(t)">{{ pct(t) }}</span>
          }
        </div>

        <div class="plano">
          @for (t of ejeY().ticks; track t) {
            <span class="rejilla-h" [style.bottom.%]="posY(t)"></span>
          }
          @for (t of ejeX().ticks; track t) {
            <span class="rejilla-v" [style.left.%]="posX(t)"></span>
          }
          <span class="promedio-v" [style.left.%]="posX(1)"></span>
          <span class="promedio-h" [style.bottom.%]="posY(baseGrave())"></span>
          <span class="rotulo-promedio-v" [style.left.%]="posX(1)">promedio</span>
          <span class="rotulo-promedio-h" [style.bottom.%]="posY(baseGrave())">promedio</span>

          @for (p of puntos(); track p.clave) {
            <button type="button" class="punto" tabindex="-1" [class.elegido]="p.elegido" [class.hueco]="p.hueco"
                    [attr.data-tip]="p.tip" [attr.aria-label]="p.tip" [attr.data-tip-izq]="p.anclaIzq ? '' : null" [attr.data-tip-der]="p.anclaDer ? '' : null"
                    [style.left.%]="p.x" [style.bottom.%]="p.y" [style.width.px]="p.diametro" [style.height.px]="p.diametro"
                    (click)="elegir.emit(p.escenario)"></button>
          }

          @if (marcado(); as m) {
            <span class="rotulo-elegido" [class.izq]="m.x > 70" [style.left.%]="m.x" [style.bottom.%]="m.y">Escenario elegido</span>
          }
        </div>
      </div>

      <div class="eje-x" aria-hidden="true">
        <div class="relleno"></div>
        <div class="ticks-x">
          @for (t of ejeX().ticks; track t) {
            <span class="tic-x" [style.left.%]="posX(t)">{{ num(t) }}×</span>
          }
        </div>
      </div>
      <p class="eje-x-titulo">Frecuencia de siniestros, en veces el promedio →</p>
    </div>

    <ul class="leyenda">
      <li><span class="m-punto"></span> Combinación (más grande = más siniestros reales)</li>
      <li><span class="m-punto hueco"></span> Sin casos reales: solo estimación</li>
      <li><span class="m-punto elegido"></span> Escenario elegido</li>
      <li><span class="m-linea"></span> Promedio</li>
    </ul>

    <details class="tabla">
      <summary>Ver las 60 combinaciones como tabla</summary>
      <div class="tabla-scroll">
        <table>
          <caption class="solo-lectores">Las 60 combinaciones de clima, calzada y franja, de mayor a menor índice de riesgo</caption>
          <thead>
            <tr>
              <th scope="col">Clima</th>
              <th scope="col">Calzada</th>
              <th scope="col">Franja</th>
              <th scope="col">Nivel</th>
              <th scope="col" class="num">Índice</th>
              <th scope="col" class="num">Frecuencia</th>
              <th scope="col" class="num">% grave o mortal</th>
              <th scope="col" class="num">Observados</th>
              <th scope="col"><span class="solo-lectores">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            @for (f of filas(); track f.clave) {
              <tr [class.elegida]="f.elegido">
                <td>{{ f.e.escenario.clima }}</td>
                <td>{{ f.e.escenario.calzada }}</td>
                <td>{{ f.e.escenario.franja }}</td>
                <td>{{ f.nivel }}</td>
                <td class="num">{{ f.indice }}×</td>
                <td class="num">{{ f.frecuencia }}×</td>
                <td class="num">{{ f.grave }}</td>
                <td class="num">{{ f.soporte }}</td>
                <td>
                  <button type="button" class="elegir" [attr.aria-label]="'Elegir ' + f.descripcion" [disabled]="f.elegido"
                          (click)="elegir.emit(f.e.escenario)">
                    {{ f.elegido ? 'Elegido' : 'Elegir' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
  styles: `
    :host { display: block; }
    .marco { display: flex; flex-direction: column; }
    .eje-y-titulo, .eje-x-titulo { margin: 0; font-size: 0.76rem; color: var(--tinta-2); }
    .eje-y-titulo { margin-bottom: 6px; }
    .eje-x-titulo { margin-top: 2px; text-align: right; }

    .cuerpo { display: grid; grid-template-columns: 38px minmax(0, 1fr); column-gap: 6px; height: 340px; }
    .eje-y { position: relative; }
    .tic-y {
      position: absolute; right: 0; transform: translateY(50%);
      font-size: 0.7rem; color: var(--tinta-3); font-variant-numeric: tabular-nums;
    }
    .plano {
      position: relative;
      background: #fff;
      border-left: 1px solid var(--borde);
      border-bottom: 1px solid var(--borde);
    }
    .rejilla-h { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--rejilla); }
    .rejilla-v { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid var(--rejilla); }
    .promedio-v { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--tinta-2); }
    .promedio-h { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed var(--tinta-2); }
    .rotulo-promedio-v, .rotulo-promedio-h { position: absolute; font-size: 0.68rem; color: var(--tinta-2); pointer-events: none; }
    .rotulo-promedio-v { top: 2px; transform: translateX(4px); }
    .rotulo-promedio-h { right: 4px; transform: translateY(-110%); }

    .punto {
      position: absolute;
      padding: 0;
      transform: translate(-50%, 50%);
      background: ${PALETA.serie1};
      border: 2px solid #fff;
      border-radius: 50%;
      opacity: 0.8;
      cursor: pointer;
      z-index: 2;
    }
    .punto:hover { opacity: 1; z-index: 6; }
    .punto.hueco { background: #fff; border: 2px solid ${PALETA.serie1}; opacity: 1; }
    .punto.elegido { background: ${PALETA.serie2}; border: 2px solid var(--tinta); opacity: 1; z-index: 5; }
    .rotulo-elegido {
      position: absolute; z-index: 5; transform: translate(16px, 50%);
      padding: 1px 6px; font-size: 0.7rem; font-weight: 600; color: var(--tinta);
      background: #fff; border: 1px solid var(--borde); border-radius: 4px; white-space: nowrap; pointer-events: none;
    }
    .rotulo-elegido.izq { transform: translate(calc(-100% - 16px), 50%); }

    .eje-x { display: grid; grid-template-columns: 38px minmax(0, 1fr); column-gap: 6px; margin-top: 4px; }
    .ticks-x { position: relative; height: 16px; }
    .tic-x {
      position: absolute; top: 0; transform: translateX(-50%);
      font-size: 0.7rem; color: var(--tinta-3); font-variant-numeric: tabular-nums;
    }

    .leyenda { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0.7rem 0 0; padding: 0; list-style: none; font-size: 0.78rem; color: var(--tinta-2); }
    .leyenda li { display: inline-flex; align-items: center; gap: 6px; }
    .m-punto { display: inline-block; width: 11px; height: 11px; background: ${PALETA.serie1}; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px var(--borde); }
    .m-punto.hueco { background: #fff; border: 2px solid ${PALETA.serie1}; box-shadow: none; }
    .m-punto.elegido { background: ${PALETA.serie2}; border-color: var(--tinta); box-shadow: none; }
    .m-linea { display: inline-block; width: 18px; border-top: 1px dashed var(--tinta-2); }

    .tabla { margin-top: 0.8rem; font-size: 0.8rem; color: var(--tinta-2); }
    summary { width: fit-content; padding: 4px 0; cursor: pointer; }
    summary:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .tabla-scroll { max-height: 360px; margin-top: 6px; overflow: auto; border: 1px solid var(--rejilla); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th, td { padding: 4px 8px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--rejilla); }
    thead th { position: sticky; top: 0; z-index: 1; font-weight: 600; color: var(--tinta); background: #f6f8fb; }
    .num { text-align: right; }
    tr.elegida td { font-weight: 600; background: #eef4fd; }
    .elegir {
      padding: 2px 10px; font: inherit; font-size: 0.76rem; color: var(--azul-claro);
      background: #fff; border: 1px solid var(--azul-claro); border-radius: 6px; cursor: pointer;
    }
    .elegir:hover:not(:disabled) { color: #fff; background: var(--azul-claro); }
    .elegir:disabled { color: var(--gris); border-color: var(--borde); cursor: default; }
    .elegir:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }

    @media (max-width: 600px) { .cuerpo { height: 280px; } }
  `,
})
export class GraficoDispersionComponent {
  readonly estimaciones = input.required<readonly Estimacion[]>();
  readonly seleccionado = input.required<Escenario>();
  /** probabilidad promedio de que un siniestro sea grave o mortal (la línea horizontal) */
  readonly baseGrave = input.required<number>();
  readonly elegir = output<Escenario>();

  protected readonly ejeX = computed(() => escalaNice(0, Math.max(1.2, ...this.estimaciones().map((e) => e.frecuencia)) * 1.05, 5));
  protected readonly ejeY = computed(() => {
    const valores = [...this.estimaciones().map((e) => e.pGrave), this.baseGrave()];
    return escalaNice(Math.min(...valores) * 0.95, Math.max(...valores) * 1.05, 5);
  });

  protected readonly posX = (v: number) => posicion(v, this.ejeX());
  protected readonly posY = (v: number) => posicion(v, this.ejeY());
  protected readonly pct = (p: number) => `${Math.round(p * 100)} %`;
  protected readonly num = (n: number) => fmtDec1(n).replace(',0', '');

  private static clave(e: Escenario): string {
    return `${e.clima}|${e.calzada}|${e.franja}`;
  }
  private esElegido(e: Escenario): boolean {
    return GraficoDispersionComponent.clave(e) === GraficoDispersionComponent.clave(this.seleccionado());
  }

  protected readonly puntos = computed(() => {
    const todas = this.estimaciones();
    const maxSoporte = Math.max(1, ...todas.map((e) => e.soporte));
    return todas.map((e) => {
      const diametro = e.soporte === 0 ? DIAMETRO_HUECO : DIAMETRO_MIN + (DIAMETRO_MAX - DIAMETRO_MIN) * Math.sqrt(e.soporte / maxSoporte);
      const x = this.posX(e.frecuencia);
      return {
        clave: GraficoDispersionComponent.clave(e.escenario),
        escenario: e.escenario,
        x,
        y: this.posY(e.pGrave),
        diametro,
        hueco: e.soporte === 0,
        elegido: this.esElegido(e.escenario),
        anclaIzq: x < 30,
        anclaDer: x > 70,
        tip:
          `${describirEscenario(e.escenario)}\n` +
          `Riesgo ${TEXTO_NIVEL_VIAL[e.nivel].toLowerCase()} (índice ${fmtDec1(e.indice)}×)\n` +
          `Frecuencia ${fmtDec2(e.frecuencia)}× · ${fmtPct(e.pGrave * 100)} graves o mortales\n` +
          (e.soporte === 0 ? 'Sin siniestros observados' : `${fmtEntero(e.soporte)} siniestros observados`),
      };
    });
  });

  protected readonly marcado = computed(() => this.puntos().find((p) => p.elegido) ?? null);

  protected readonly filas = computed(() =>
    [...this.estimaciones()]
      .sort((a, b) => b.indice - a.indice)
      .map((e) => ({
        e,
        clave: GraficoDispersionComponent.clave(e.escenario),
        elegido: this.esElegido(e.escenario),
        nivel: TEXTO_NIVEL_VIAL[e.nivel],
        indice: fmtDec1(e.indice),
        frecuencia: fmtDec2(e.frecuencia),
        grave: fmtPct(e.pGrave * 100),
        soporte: fmtEntero(e.soporte),
        descripcion: describirEscenario(e.escenario),
      })),
  );
}
