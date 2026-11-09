import { Location } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MenuService } from '../../layout/menu.service';
import { IconComponent } from '../../shared/icon/icon.component';

/** Una dirección larguísima se recorta para no romper la pantalla (el texto se muestra tal cual, nunca como HTML) */
const MAX_URL = 80;

/**
 * Página 404: la dirección no corresponde a ninguna pantalla. Ofrece volver y lista solo las
 * pantallas que el rol actual puede abrir (salen del mismo menú lateral).
 */
@Component({
  selector: 'app-no-encontrada',
  imports: [RouterLink, IconComponent],
  template: `
    <section class="pagina">
      <div class="caja">
        <p class="codigo" aria-hidden="true">404</p>
        <h1>No encontramos esa página</h1>
        <p class="detalle">
          La dirección <code>{{ direccion() }}</code> no existe o fue movida. Revise que esté bien escrita o elija
          una de las pantallas disponibles.
        </p>

        <div class="botones">
          <a class="btn primario" routerLink="/dashboard">Ir al dashboard</a>
          <button type="button" class="btn" (click)="volver()">Volver atrás</button>
        </div>

        @if (secciones().length) {
          <nav class="disponibles" aria-label="Pantallas disponibles para su rol">
            <h2>Pantallas disponibles para su rol</h2>
            <ul>
              @for (s of secciones(); track s.titulo) {
                @for (item of s.items; track item.ruta) {
                  <li>
                    <a [routerLink]="'/' + item.ruta"><app-icon [name]="item.icono" /> {{ item.etiqueta }}</a>
                  </li>
                }
              }
            </ul>
          </nav>
        }
      </div>
    </section>
  `,
  styles: `
    .caja { max-width: 560px; margin: 1.5rem auto 0; padding: 2.2rem 1.5rem; text-align: center; background: #fff; border: 1px solid var(--borde); border-radius: 12px; }
    .codigo { margin: 0; font-size: 4rem; font-weight: 700; line-height: 1; letter-spacing: 2px; color: var(--azul-claro); opacity: 0.85; }
    h1 { margin: 0.4rem 0 0.5rem; font-size: 1.4rem; color: var(--azul); }
    .detalle { margin: 0 auto; max-width: 440px; color: var(--gris); line-height: 1.5; }
    code { padding: 1px 6px; font-size: 0.86em; color: var(--texto); background: var(--fondo); border-radius: 6px; overflow-wrap: anywhere; }
    .botones { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 1.4rem; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font: inherit; font-size: 0.9rem; font-weight: 600;
      color: var(--azul-claro); text-decoration: none; background: #fff; border: 1px solid var(--azul-claro); border-radius: 8px; cursor: pointer;
    }
    .btn:hover { background: #eef4fd; }
    .btn.primario { color: #fff; background: var(--azul-claro); }
    .btn.primario:hover { background: var(--azul); border-color: var(--azul); }
    .btn:focus-visible, .disponibles a:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .disponibles { margin-top: 1.8rem; padding-top: 1.2rem; text-align: left; border-top: 1px solid var(--borde); }
    .disponibles h2 { margin: 0 0 0.6rem; font-size: 0.9rem; color: var(--gris); }
    .disponibles ul { display: flex; flex-wrap: wrap; gap: 6px 8px; margin: 0; padding: 0; list-style: none; }
    .disponibles a {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; font-size: 0.84rem; color: var(--azul);
      text-decoration: none; background: #e8f0fc; border-radius: 999px;
    }
    .disponibles a:hover { background: #d7e5fa; }
    .disponibles app-icon { width: 14px; height: 14px; }
  `,
})
export class NoEncontradaComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly secciones = inject(MenuService).secciones;

  protected readonly direccion = computed(() => {
    const cruda = this.router.url.split(/[?#]/)[0] || '/';
    let url = cruda;
    try {
      url = decodeURIComponent(cruda); // «/mi%20pagina» se lee mejor como «/mi pagina»
    } catch {
      /* porcentajes mal formados: se muestra tal cual */
    }
    return url.length > MAX_URL ? url.slice(0, MAX_URL) + '…' : url;
  });

  protected volver(): void {
    // Si no hay a dónde volver (entró directo a la dirección), se va al dashboard
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/dashboard');
  }
}
