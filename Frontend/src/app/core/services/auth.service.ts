import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, switchMap, tap, throwError, timer } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { LoginRequest, LoginResponse, RolUsuario, Usuario } from '../models/auth.models';

const STORAGE_KEY = 'sivcr_session';

// SOLO PARA DESARROLLO: borrar cuando conectes el backend real
const USUARIOS_DEMO: { contrasena: string; usuario: Usuario }[] = [
  { contrasena: 'Admin123', usuario: { id: 1, nombre: 'Ana Administradora', correo: 'admin@sivcr.go.cr', rol: 'ADMIN' } },
  { contrasena: 'Analista123', usuario: { id: 2, nombre: 'Luis Analista', correo: 'analista@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' } },
  { contrasena: 'Consulta123', usuario: { id: 3, nombre: 'Carla Consultora', correo: 'consultor@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO' } },
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _sesion = signal<LoginResponse | null>(this.cargarSesion());

  readonly usuario = computed(() => this._sesion()?.usuario ?? null);
  readonly token = computed(() => this._sesion()?.token ?? null);
  readonly estaAutenticado = computed(() => this._sesion() !== null);

  login(credenciales: LoginRequest): Observable<LoginResponse> {
    const peticion$ = API_CONFIG.useMock
      ? this.loginMock(credenciales)
      : this.http.post<LoginResponse>(`${API_CONFIG.baseUrl}/auth/login`, credenciales);

    return peticion$.pipe(tap((respuesta) => this.guardarSesion(respuesta)));
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._sesion.set(null);
  }

  tieneRol(rolesPermitidos: RolUsuario[]): boolean {
    const usuario = this.usuario();
    return !!usuario && rolesPermitidos.includes(usuario.rol);
  }

  // ---------- privados ----------

  private loginMock({ correo, contrasena }: LoginRequest): Observable<LoginResponse> {
    const encontrado = USUARIOS_DEMO.find(
      (u) => u.usuario.correo === correo.trim().toLowerCase() && u.contrasena === contrasena,
    );

    // timer simula la latencia de red
    return timer(600).pipe(
      switchMap(() =>
        encontrado
          ? of({ token: 'mock-jwt-' + encontrado.usuario.id, usuario: encontrado.usuario })
          : throwError(() => new HttpErrorResponse({ status: 401 })),
      ),
    );
  }

  private guardarSesion(sesion: LoginResponse): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
    this._sesion.set(sesion);
  }

  private cargarSesion(): LoginResponse | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LoginResponse) : null;
    } catch {
      return null;
    }
  }
}
