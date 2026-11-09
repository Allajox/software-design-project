import { Component, computed, input, output } from '@angular/core';
import { PerfilDemografico } from '../../../core/services/estadisticas.service';
import { fmtEntero } from '../../../shared/utils/formato';
import { PALETA } from '../../../shared/utils/paleta';

/**
 * Pirámide demográfica: hombres a la izquierda, mujeres a la derecha, un rango de edad por fila.
 * Ambos lados usan la MISMA escala (el mayor valor de cualquiera de los dos), para que
 * la longitud de las barras sea comparable entre lados.
 */
@Component({
  selector: 'app-piramide',
  template: `
    <div class="leyenda">
      @for (g of generos; track g.nombre) {
        <button
          type="button"
          [class.seleccionado]="generosSel().includes(g.nombre)"
          [attr.aria-pressed]="generosSel().includes(g.nombre)"
          (click)="alternarGenero.emit(g.nombre)"
        >
          <span class="muestra" [style.background]="g.color"></span>{{ g.nombre }}
        </button>
      }
    </div>

    <div class="piramide" role="group" [attr.aria-label]="ariaLabel()">
      @for (f of filas(); track f.edad) {
        <div class="lado izq" [attr.data-tip]="f.tipM">
          <span class="barra" [style.width.%]="f.anchoM" [style.background]="colorM"></span>
          <span class="valor">{{ f.textoM }}</span>
        </div>
        <button
          type="button"
          class="edad"
          [class.seleccionada]="edadesSel().includes(f.edad)"
          [attr.aria-pressed]="edadesSel().includes(f.edad)"
          (click)="alternarEdad.emit(f.edad)"
        >
          {{ f.edad }}
        </button>
        <div class="lado der" [attr.data-tip]="f.tipF">
          <span class="barra" [style.width.%]="f.anchoF" [style.background]="colorF"></span>
          <span class="valor">{{ f.textoF }}</span>
        </div>
      }
    </div>
    <p class="nota">Rango de edad en años</p>
  `,
  styles: `
    .leyenda { display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.7rem; }
    .leyenda button {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 4px 10px; font: inherit; font-size: 0.84rem; color: var(--tinta);
      background: none; border: 1px solid transparent; border-radius: 999px; cursor: pointer;
    }
    .leyenda button:hover { background: var(--fondo); }
    .leyenda button.seleccionado { background: #e8f0fc; border-color: #bcd3f4; }
    .leyenda button:focus-visible, .edad:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 1px; }
    .muestra { width: 12px; height: 12px; border-radius: 3px; }

    :host { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .piramide {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 60px minmax(0, 1fr);
      row-gap: 8px;
      align-items: center;
    }
    .lado { display: flex; align-items: center; gap: 6px; height: 40px; }
    /* row-reverse: el primer elemento (la barra) queda pegado al centro y el número al extremo */
    .lado.izq { flex-direction: row-reverse; justify-content: flex-start; padding-left: 4px; }
    .lado.der { justify-content: flex-start; padding-right: 4px; }
    .barra { display: block; height: 30px; min-width: 0; transition: width 0.25s ease; }
    .izq .barra { border-radius: 4px 0 0 4px; }
    .der .barra { border-radius: 0 4px 4px 0; }
    .valor { font-size: 0.8rem; color: var(--tinta); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .edad {
      padding: 4px 0; font: inherit; font-size: 0.82rem; text-align: center; color: var(--tinta-2);
      background: none; border: 0; border-radius: 6px; cursor: pointer;
    }
    .edad:hover { background: var(--fondo); }
    .edad.seleccionada { background: #e8f0fc; color: var(--tinta); font-weight: 600; }
    .nota { margin: 0.6rem 0 0; text-align: center; font-size: 0.74rem; color: var(--tinta-3); }
  `,
})
export class PiramideComponent {
  readonly perfil = input.required<PerfilDemografico>();
  readonly edadesSel = input<readonly string[]>([]);
  readonly generosSel = input<readonly string[]>([]);
  readonly ariaLabel = input.required<string>();
  readonly alternarEdad = output<string>();
  readonly alternarGenero = output<string>();

  protected readonly colorM = PALETA.serie1;
  protected readonly colorF = PALETA.serie2;
  protected readonly generos = [
    { nombre: 'Masculino', color: PALETA.serie1 },
    { nombre: 'Femenino', color: PALETA.serie2 },
  ];

  protected readonly filas = computed(() => {
    const p = this.perfil();
    const maximo = Math.max(0, ...p.masculino, ...p.femenino);
    // 82 % del ancho de cada lado como máximo: el resto queda para escribir el número
    const ancho = (v: number) => (maximo > 0 ? (v / maximo) * 82 : 0);
    return p.edades.map((edad, i) => ({
      edad,
      anchoM: ancho(p.masculino[i]),
      anchoF: ancho(p.femenino[i]),
      textoM: fmtEntero(p.masculino[i]),
      textoF: fmtEntero(p.femenino[i]),
      tipM: `Masculino · ${edad}\n${fmtEntero(p.masculino[i])} personas`,
      tipF: `Femenino · ${edad}\n${fmtEntero(p.femenino[i])} personas`,
    }));
  });
}
