import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API_CONFIG } from '../../core/config/api.config';
import { ROLES_DASHBOARD } from '../../core/config/roles.config';
import { AuthService } from '../../core/services/auth.service';
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
 * Vista pública (HU 18/19): cifras generales de siniestralidad, sin iniciar sesión («Ingresar sin Credenciales» del login).
 * Solo muestra totales agrupados; no hay filtros ni registros individuales. Quien sí tiene sesión (el consultor público
 * llega aquí) ve su nombre y puede cerrarla; quien tiene dashboard, volver a él.
 */
@Component({
  selector: 'app-publico',
  imports: [BarrasRankeadasComponent, RouterLink],
  template: `
    <main class="publico">
      <header>
        <h1>Siniestralidad vial en Costa Rica</h1>
        <p>Cifras generales de siniestros viales registrados por COSEVI.</p>
        <p class="acceso">
          @if (usuario(); as u) {
            <span>Sesión de <strong>{{ u.nombre }}</strong></span>
            @if (tienePanel()) { <a routerLink="/dashboard">Ir al panel de indicadores</a> }
            <button type="button" (click)="salir()">Cerrar sesión</button>
          } @else {
            <a routerLink="/login">Ingresar al sistema</a>
          }
        </p>
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
    header a, .acceso button { color: var(--azul-claro); font-size: 0.9rem; }
    .acceso { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 1rem; margin: 0; font-size: 0.9rem; }
    .acceso button { padding: 0; font: inherit; font-size: 0.9rem; background: none; border: 0; text-decoration: underline; cursor: pointer; }
    .acceso button:focus-visible, header a:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .total { margin: 1.6rem 0 0.4rem; font-size: 1.1rem; }
    .total strong { font-size: 2rem; color: var(--azul); font-variant-numeric: tabular-nums; }
    section { margin-top: 1.6rem; padding: 1rem 1.1rem; background: #fff; border: 1px solid var(--borde); border-radius: 12px; }
    h2 { margin: 0 0 0.6rem; font-size: 1rem; }
    .aviso { margin-top: 2rem; color: var(--tinta-2); }
  `,
})
export class PublicoComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly usuario = this.auth.usuario;
  protected readonly tienePanel = computed(() => this.auth.tieneRol(ROLES_DASHBOARD));

  protected readonly recurso = httpResource<ResumenPublico>(() => `${API_CONFIG.baseUrl}/public/summary`);

  private readonly datos = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));
  protected readonly total = computed(() => fmtEntero(this.datos()?.totalSiniestros ?? 0));
  protected readonly anios = computed(() => aFilas(this.datos()?.porAnio));
  protected readonly provincias = computed(() => aFilas(this.datos()?.porProvincia));
  protected readonly severidades = computed(() => aFilas(this.datos()?.porSeveridad));
  protected readonly franjas = computed(() => aFilas(this.datos()?.porFranja));

  protected salir(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
