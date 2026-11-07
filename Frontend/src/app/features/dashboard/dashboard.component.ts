import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ROL_ETIQUETA } from '../../core/models/auth.models';

@Component({
  selector: 'app-dashboard',
  template: `
    <div style="padding: 2rem">
      <h2>Dashboard SIVCR</h2>
      @if (auth.usuario(); as u) {
        <p>Bienvenido/a <strong>{{ u.nombre }}</strong> — {{ etiquetas[u.rol] }}</p>
      }
      <button (click)="salir()">Cerrar sesión</button>
    </div>
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly etiquetas = ROL_ETIQUETA;

  salir(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
