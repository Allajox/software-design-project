import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { hayErrores, motivoNoCambiarRol, resumirCuentas, validarFormulario } from '../usuarios/usuarios';
import { CuentaPublica, DatosFormularioUsuario } from '../usuarios/usuarios.models';
import { mensajeDeError } from './errores-api';
import { ResultadoGuardadoApi, UsuarioApi, aCuentaPublica, aPeticion, errorDeGuardado } from './usuarios-api';

/**
 * Cuentas de usuario del servidor (HU 29; solo ADMIN, el servidor lo verifica en cada petición):
 *   GET /api/users · POST /api/users · PUT /api/users/{id} · PUT /api/users/{id}/active.
 * No existe DELETE (las cuentas se desactivan) ni «último acceso». Mantiene la lista en una señal para que la pantalla
 * se actualice sola; las reglas (último administrador, nadie cambia su propio rol…) las repite aquí solo para avisar
 * antes de viajar: quien manda es el servidor.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_CONFIG.baseUrl}/users`;

  readonly cuentas = signal<CuentaPublica[]>([]);
  readonly cargando = signal(false);
  /** Frase para la persona si no se pudo leer la lista (null = sin problema) */
  readonly error = signal<string | null>(null);
  /** true cuando la lista ya llegó al menos una vez */
  readonly listo = signal(false);
  readonly resumen = computed(() => resumirCuentas(this.cuentas()));

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(this.http.get<UsuarioApi[]>(this.base));
      this.cuentas.set(lista.map(aCuentaPublica));
      this.listo.set(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  cuentaPorId(id: number): CuentaPublica | undefined {
    return this.cuentas().find((c) => c.id === id);
  }

  async crear(datos: DatosFormularioUsuario): Promise<ResultadoGuardadoApi> {
    const errores = validarFormulario(datos, { cuentas: this.cuentas() });
    if (hayErrores(errores)) return { ok: false, errores };
    try {
      const creada = aCuentaPublica(await firstValueFrom(this.http.post<UsuarioApi>(this.base, aPeticion(datos))));
      this.cuentas.update((l) => [...l, creada]);
      return { ok: true, cuenta: creada };
    } catch (e) {
      return errorDeGuardado(e);
    }
  }

  /** `idActual`: quien usa la pantalla (nadie cambia su propio rol). Una contraseña vacía deja la actual. */
  async actualizar(id: number, datos: DatosFormularioUsuario, idActual: number | undefined): Promise<ResultadoGuardadoApi> {
    if (!this.cuentaPorId(id)) return { ok: false, errores: {}, general: 'La cuenta ya no existe. Actualice la lista.' };
    const errores = validarFormulario(datos, { cuentas: this.cuentas(), idEditando: id });
    if (hayErrores(errores)) return { ok: false, errores };
    const motivo = motivoNoCambiarRol(id, datos.rol, this.cuentas(), idActual);
    if (motivo) return { ok: false, errores: { rol: motivo } };
    try {
      const guardada = aCuentaPublica(await firstValueFrom(this.http.put<UsuarioApi>(`${this.base}/${id}`, aPeticion(datos))));
      this.cuentas.update((l) => l.map((c) => (c.id === id ? guardada : c)));
      return { ok: true, cuenta: guardada };
    } catch (e) {
      return errorDeGuardado(e);
    }
  }

  /** Activa o desactiva. Al desactivar, el servidor cierra las sesiones abiertas de esa cuenta. */
  async cambiarActivo(id: number, activo: boolean): Promise<{ ok: true; cuenta: CuentaPublica } | { ok: false; mensaje: string }> {
    try {
      const guardada = aCuentaPublica(await firstValueFrom(this.http.put<UsuarioApi>(`${this.base}/${id}/active`, { activo })));
      this.cuentas.update((l) => l.map((c) => (c.id === id ? guardada : c)));
      return { ok: true, cuenta: guardada };
    } catch (e) {
      return { ok: false, mensaje: mensajeDeError(e) };
    }
  }
}
