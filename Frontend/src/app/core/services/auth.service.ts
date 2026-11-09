import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, switchMap, tap, timer } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { LoginRequest, LoginResponse, RolUsuario, Usuario } from '../models/auth.models';
import { verificarContrasena } from '../usuarios/credenciales';
import { CuentaPublica } from '../usuarios/usuarios.models';
import { UsuariosService } from './usuarios.service';

const STORAGE_KEY = 'sivcr_session';

/** Hash que no corresponde a ninguna contraseña: se verifica contra él cuando el correo no existe, para no tardar distinto */
const CLAVE_SIN_USO = 'pbkdf2-sha256$120000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const identidad = (c: CuentaPublica): Usuario => ({ id: c.id, nombre: c.nombre, correo: c.correo, rol: c.rol });

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly usuarios = inject(UsuariosService);

  private readonly _sesion = signal<LoginResponse | null>(this.cargarSesion());

  readonly usuario = computed(() => this._sesion()?.usuario ?? null);
  readonly token = computed(() => this._sesion()?.token ?? null);
  readonly estaAutenticado = computed(() => this._sesion() !== null);

  constructor() {
    // Una sesión guardada de antes puede ser de una cuenta que ya se desactivó o cambió de rol
    this.sincronizarSesion();
  }

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

  /**
   * Compara la sesión con la cuenta que hay hoy en el almacén: si la cuenta ya no existe o está
   * desactivada se cierra la sesión; si cambió el nombre, el correo o el rol, la sesión se actualiza.
   * (Con el backend real esto lo resuelve el servidor en cada petición.)
   * @returns false si la sesión se cerró
   */
  sincronizarSesion(): boolean {
    const sesion = this._sesion();
    if (!API_CONFIG.useMock || !sesion) return true;

    const cuenta = this.usuarios.cuentaPorId(sesion.usuario.id);
    if (!cuenta || !cuenta.activo) {
      this.logout();
      return false;
    }
    const vigente = identidad(cuenta);
    if (JSON.stringify(vigente) !== JSON.stringify(sesion.usuario)) {
      this.guardarSesion({ ...sesion, usuario: vigente });
    }
    return true;
  }

  // ---------- privados ----------

  private loginMock(credenciales: LoginRequest): Observable<LoginResponse> {
    // timer simula la latencia de red
    return timer(600).pipe(switchMap(() => from(this.autenticarMock(credenciales))));
  }

  private async autenticarMock({ correo, contrasena }: LoginRequest): Promise<LoginResponse> {
    const cuenta = this.usuarios.buscarPorCorreo(correo);
    const coincide = await verificarContrasena(contrasena, cuenta?.clave ?? CLAVE_SIN_USO);

    // Mismo error para «no existe» y «contraseña incorrecta»: no se revela qué correos están registrados
    if (!cuenta || !coincide) throw new HttpErrorResponse({ status: 401 });
    // Solo quien ya demostró saber la contraseña se entera de que su cuenta está desactivada
    if (!cuenta.activo) throw new HttpErrorResponse({ status: 403 });

    this.usuarios.registrarAcceso(cuenta.id);
    return { token: 'mock-jwt-' + cuenta.id, usuario: identidad(cuenta) };
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
