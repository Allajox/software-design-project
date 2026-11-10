import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_CONFIG } from '../../core/config/api.config';
import { ItemConteo } from '../../core/services/estadisticas.service';
import { fmtEntero, fmtPct } from '../../shared/utils/formato';
import { BarrasRankeadasComponent, FilaBarra } from '../dashboard/graficos/barras-rankeadas.component';

interface ResumenPublico {
  totalSiniestros: number;
  porAnio: ItemConteo[];
  porProvincia: ItemConteo[];
  porSeveridad: ItemConteo[];
  porFranja: ItemConteo[];
}

const aFilas = (items: readonly ItemConteo[] | undefined): FilaBarra[] =>
  (items ?? []).map((i) => ({
    clave: i.etiqueta,
    etiqueta: i.etiqueta,
    valor: i.valor,
    texto: fmtEntero(i.valor),
    extras: [fmtPct(i.porcentaje)],
    tip: `${i.etiqueta}\n${fmtEntero(i.valor)} siniestros (${fmtPct(i.porcentaje)})`,
  }));

/**
 * Vista pública (HU 18): cifras generales de siniestralidad, sin iniciar sesión.
 * Solo muestra totales agrupados; no hay filtros ni registros individuales.
 */
@Component({
  selector: 'app-publico',
  imports: [BarrasRankeadasComponent, RouterLink],
  template: `
    <main class="publico">
      <header>
        <h1>Siniestralidad vial en Costa Rica</h1>
        <p>Cifras generales de siniestros viales registrados por COSEVI.</p>
        <a routerLink="/login">Ingresar al sistema</a>
      </header>

      @if (recurso.error()) {
        <p class="aviso" role="alert">No se pudieron cargar las cifras. Intente de nuevo en unos minutos.</p>
      } @else if (!recurso.hasValue()) {
        <p class="aviso" role="status">Cargando cifras…</p>
      } @else {
        <p class="total"><strong>{{ total() }}</strong> siniestros registrados</p>

        <section>
          <h2>Por año</h2>
          <app-barras-rankeadas ariaLabel="Siniestros por año" anchoEtiqueta="60px" [columnasExtra]="['%']" [filas]="anios()" />
        </section>
        <section>
          <h2>Por provincia</h2>
          <app-barras-rankeadas ariaLabel="Siniestros por provincia" anchoEtiqueta="110px" [columnasExtra]="['%']" [filas]="provincias()" />
        </section>
        <section>
          <h2>Por gravedad</h2>
          <app-barras-rankeadas ariaLabel="Siniestros por gravedad" anchoEtiqueta="90px" [columnasExtra]="['%']" [filas]="severidades()" />
        </section>
        <section>
          <h2>Por franja horaria</h2>
          <app-barras-rankeadas ariaLabel="Siniestros por franja horaria" anchoEtiqueta="90px" [columnasExtra]="['%']" [filas]="franjas()" />
        </section>
      }
    </main>
  `,
  styles: `
    .publico { max-width: 760px; margin: 0 auto; padding: 2rem 1rem 3rem; color: var(--tinta); }
    h1 { margin: 0; font-size: 1.6rem; }
    header p { margin: 0.3rem 0 0.6rem; color: var(--tinta-2); }
    header a { color: var(--azul-claro); font-size: 0.9rem; }
    .total { margin: 1.6rem 0 0.4rem; font-size: 1.1rem; }
    .total strong { font-size: 2rem; color: var(--azul); font-variant-numeric: tabular-nums; }
    section { margin-top: 1.6rem; padding: 1rem 1.1rem; background: #fff; border: 1px solid var(--borde); border-radius: 12px; }
    h2 { margin: 0 0 0.6rem; font-size: 1rem; }
    .aviso { margin-top: 2rem; color: var(--tinta-2); }
  `,
})
export class PublicoComponent {
  protected readonly recurso = httpResource<ResumenPublico>(() => `${API_CONFIG.baseUrl}/public/summary`);

  private readonly datos = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));
  protected readonly total = computed(() => fmtEntero(this.datos()?.totalSiniestros ?? 0));
  protected readonly anios = computed(() => aFilas(this.datos()?.porAnio));
  protected readonly provincias = computed(() => aFilas(this.datos()?.porProvincia));
  protected readonly severidades = computed(() => aFilas(this.datos()?.porSeveridad));
  protected readonly franjas = computed(() => aFilas(this.datos()?.porFranja));
}
