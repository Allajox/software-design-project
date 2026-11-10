import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { API_CONFIG } from '../../../core/config/api.config';
import { rutaInicial } from '../../../core/config/roles.config';

/**
 * Inicio de sesión (Figma): «Ingresar» entra con correo y contraseña (POST /api/auth/login) y cada rol llega a su pantalla
 * inicial; «Ingresar sin Credenciales» abre la vista pública (/publico), que no necesita sesión.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly mostrarClave = signal(false);
  readonly modoDemo = API_CONFIG.useMock;

  readonly form = this.fb.nonNullable.group({
    correo: ['', [Validators.required, Validators.email]],
    contrasena: ['', [Validators.required]],
  });

  get correo() { return this.form.controls.correo; }
  get contrasena() { return this.form.controls.contrasena; }

  alternarClave(): void {
    this.mostrarClave.update((v) => !v);
  }

  iniciarSesion(): void {
    if (this.cargando()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (sesion) => {
        const destino = this.route.snapshot.queryParamMap.get('returnUrl');
        // returnUrl solo si es una ruta propia (empieza con una sola «/»): nunca una dirección de otro sitio
        const propia = !!destino && destino.startsWith('/') && !destino.startsWith('//');
        this.router.navigateByUrl(propia ? destino : rutaInicial(sesion.usuario.rol));
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(this.traducirError(err));
        this.cargando.set(false);
      },
    });
  }

  private traducirError(err: HttpErrorResponse): string {
    if (err.status === 401) return 'Correo o contraseña incorrectos.';
    if (err.status === 403) return 'Su cuenta está desactivada. Comuníquese con una persona administradora.';
    if (err.status === 0) return 'No hay conexión con el servidor. Intente de nuevo.';
    return 'Ocurrió un error inesperado. Intente más tarde.';
  }
}
