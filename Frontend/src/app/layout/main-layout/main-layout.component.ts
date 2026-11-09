import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ConsultasService } from '../../core/services/consultas.service';
import { ROL_ETIQUETA } from '../../core/models/auth.models';
import { IconComponent } from '../../shared/icon/icon.component';
import { AvisosComponent } from '../../shared/ui/avisos.component';
import { MenuService } from '../menu.service';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, AvisosComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuService);
  /** Se crea aquí para que el historial automático funcione desde que la persona entra */
  private readonly consultas = inject(ConsultasService);

  readonly usuario = this.auth.usuario;
  readonly secciones = this.menu.secciones;

  /** true = menú reducido a íconos (solo escritorio) */
  readonly colapsado = signal(false);
  /** true = menú desplegado como cajón (solo móvil) */
  readonly movilAbierto = signal(false);

  readonly etiquetaRol = computed(() => {
    const u = this.usuario();
    return u ? ROL_ETIQUETA[u.rol] : '';
  });

  readonly iniciales = computed(() => {
    const nombre = this.usuario()?.nombre ?? '';
    return nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  });

  /** URL actual, se actualiza en cada navegación */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly ubicacion = computed(() => this.menu.ubicacion(this.url()));

  alternarColapso(): void {
    this.colapsado.update((v) => !v);
  }

  abrirMovil(): void {
    this.movilAbierto.set(true);
  }

  cerrarMovil(): void {
    this.movilAbierto.set(false);
  }

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
