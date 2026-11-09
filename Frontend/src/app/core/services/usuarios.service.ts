import { Injectable, computed, inject, signal } from '@angular/core';
import { hashearContrasena } from '../usuarios/credenciales';
import { adminDemo, crearAlmacenInicial } from '../usuarios/semilla';
import {
  garantizarAdministrador, hayErrores, motivoNoCambiarRol, motivoNoDesactivar, motivoNoEliminar, normalizarCorreo,
  normalizarNombre, resumirCuentas, sanitizarAlmacen, validarFormulario,
} from '../usuarios/usuarios';
import {
  AlmacenUsuarios, CuentaPublica, CuentaUsuario, DatosFormularioUsuario, ErroresFormularioUsuario,
} from '../usuarios/usuarios.models';
import { AvisosService } from './avisos.service';

const CLAVE_ALMACEN = 'sivcr_usuarios';

export type ResultadoGuardado =
  | { ok: true; cuenta: CuentaPublica }
  /** `errores` van junto a cada campo; `general` es un problema que no es de un campo en particular */
  | { ok: false; errores: ErroresFormularioUsuario; general?: string };

const publica = ({ clave: _clave, ...resto }: CuentaUsuario): CuentaPublica => resto;

/**
 * Cuentas de usuario (RF-9). Hoy viven en el navegador (localStorage), con las contraseñas ya
 * convertidas en hash. Cuando exista el backend, cada método de esta clase pasa a ser una llamada
 * HTTP (GET/POST/PUT/PATCH/DELETE /usuarios) y las reglas de `core/usuarios/usuarios.ts` se
 * vuelven a aplicar en el servidor, que es quien de verdad protege el acceso.
 *
 * No depende de AuthService (al revés sí): por eso las acciones reciben `idActual`, la persona
 * que está usando la pantalla, para aplicar las reglas «nadie se desactiva a sí mismo».
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly avisos = inject(AvisosService);
  private readonly _almacen = signal<AlmacenUsuarios>(this.cargar());

  /** Las cuentas sin su clave: es lo único que ve la pantalla */
  readonly cuentas = computed<CuentaPublica[]>(() => this._almacen().cuentas.map(publica));
  readonly resumen = computed(() => resumirCuentas(this._almacen().cuentas));

  // ----- Consultas (las usa AuthService) -----

  /** La cuenta completa, con su hash, para verificar la contraseña. No sale de la capa de servicios. */
  buscarPorCorreo(correo: string): CuentaUsuario | undefined {
    const c = normalizarCorreo(correo);
    return this._almacen().cuentas.find((x) => x.correo === c);
  }

  cuentaPorId(id: number): CuentaPublica | undefined {
    return this.cuentas().find((c) => c.id === id);
  }

  registrarAcceso(id: number): void {
    this.cambiar((cuentas) => cuentas.map((c) => (c.id === id ? { ...c, ultimoAcceso: new Date().toISOString() } : c)));
  }

  // ----- Crear y editar -----

  async crear(datos: DatosFormularioUsuario): Promise<ResultadoGuardado> {
    const limpio = this.limpiar(datos);
    const errores = this.revisar(limpio, undefined, undefined);
    if (hayErrores(errores)) return { ok: false, errores };

    let clave: string;
    try {
      clave = await hashearContrasena(limpio.contrasena);
    } catch (e) {
      return { ok: false, errores: {}, general: this.mensaje(e) };
    }

    // Mientras se calculaba el hash, el estado pudo cambiar (doble clic, otra acción): se revisa de nuevo
    const otra = this.revisar(limpio, undefined, undefined);
    if (hayErrores(otra)) return { ok: false, errores: otra };

    const nueva: CuentaUsuario = {
      id: this._almacen().proximoId,
      nombre: limpio.nombre, correo: limpio.correo, rol: limpio.rol, activo: true,
      clave, creadoEn: new Date().toISOString(), ultimoAcceso: null,
    };
    this.confirmar({ ...this._almacen(), proximoId: nueva.id + 1, cuentas: [...this._almacen().cuentas, nueva] });
    return { ok: true, cuenta: publica(nueva) };
  }

  /** Edita nombre, correo y rol; si `datos.contrasena` trae algo, también la contraseña */
  async actualizar(id: number, datos: DatosFormularioUsuario, idActual: number | undefined): Promise<ResultadoGuardado> {
    if (!this.cuentaPorId(id)) return { ok: false, errores: {}, general: 'La cuenta ya no existe.' };
    const limpio = this.limpiar(datos);
    const errores = this.revisar(limpio, id, idActual);
    if (hayErrores(errores)) return { ok: false, errores };

    let clave: string | null = null;
    try {
      if (limpio.contrasena) clave = await hashearContrasena(limpio.contrasena);
    } catch (e) {
      return { ok: false, errores: {}, general: this.mensaje(e) };
    }

    if (!this.cuentaPorId(id)) return { ok: false, errores: {}, general: 'La cuenta ya no existe.' };
    const otra = this.revisar(limpio, id, idActual);
    if (hayErrores(otra)) return { ok: false, errores: otra };

    let editada!: CuentaUsuario;
    this.cambiar((cuentas) =>
      cuentas.map((c) => {
        if (c.id !== id) return c;
        editada = { ...c, nombre: limpio.nombre, correo: limpio.correo, rol: limpio.rol, clave: clave ?? c.clave };
        return editada;
      }),
    );
    return { ok: true, cuenta: publica(editada) };
  }

  // ----- Activar, desactivar, eliminar -----

  /** @returns el motivo por el que no se pudo, o null si se hizo */
  alternarActivo(id: number, idActual: number | undefined): string | null {
    const cuenta = this.cuentaPorId(id);
    if (!cuenta) return 'La cuenta ya no existe.';
    if (cuenta.activo) {
      const motivo = motivoNoDesactivar(id, this.cuentas(), idActual);
      if (motivo) return motivo;
    }
    this.cambiar((cuentas) => cuentas.map((c) => (c.id === id ? { ...c, activo: !c.activo } : c)));
    return null;
  }

  /** @returns el motivo por el que no se pudo, o null si se hizo */
  eliminar(id: number, idActual: number | undefined): string | null {
    if (!this.cuentaPorId(id)) return 'La cuenta ya no existe.';
    const motivo = motivoNoEliminar(id, this.cuentas(), idActual);
    if (motivo) return motivo;
    this.cambiar((cuentas) => cuentas.filter((c) => c.id !== id));
    return null;
  }

  /** Vuelve a las tres cuentas de demostración (solo para el modo sin backend) */
  restablecerDemo(): void {
    this.confirmar(crearAlmacenInicial(new Date().toISOString()));
  }

  // ----- Internos -----

  private limpiar(d: DatosFormularioUsuario): DatosFormularioUsuario {
    return { ...d, nombre: normalizarNombre(d.nombre), correo: normalizarCorreo(d.correo) };
  }

  /** Validación del formulario + regla de roles, contra el estado actual */
  private revisar(d: DatosFormularioUsuario, idEditando: number | undefined, idActual: number | undefined): ErroresFormularioUsuario {
    const errores = validarFormulario(d, { cuentas: this.cuentas(), idEditando });
    if (idEditando !== undefined && !errores.rol) {
      const motivo = motivoNoCambiarRol(idEditando, d.rol, this.cuentas(), idActual);
      if (motivo) errores.rol = motivo;
    }
    return errores;
  }

  private mensaje(e: unknown): string {
    return e instanceof Error ? e.message : 'No se pudo proteger la contraseña.';
  }

  private cambiar(f: (cuentas: CuentaUsuario[]) => CuentaUsuario[]): void {
    const actual = this._almacen();
    this.confirmar({ ...actual, cuentas: f(actual.cuentas) });
  }

  private confirmar(almacen: AlmacenUsuarios): void {
    this._almacen.set(almacen);
    this.persistir(almacen);
  }

  private cargar(): AlmacenUsuarios {
    const ahora = new Date().toISOString();
    let crudo: unknown = null;
    try {
      const raw = localStorage.getItem(CLAVE_ALMACEN);
      crudo = raw ? JSON.parse(raw) : null;
    } catch {
      crudo = null; // almacenamiento bloqueado o JSON dañado: se parte de cero
    }

    let almacen = crudo === null ? crearAlmacenInicial(ahora) : sanitizarAlmacen(crudo, ahora);
    if (almacen.cuentas.length === 0) almacen = crearAlmacenInicial(ahora);
    const revisado = garantizarAdministrador(almacen, adminDemo(ahora));

    if (crudo === null || revisado.restaurada) this.persistir(revisado.almacen);
    return revisado.almacen;
  }

  private persistir(almacen: AlmacenUsuarios): void {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(almacen));
    } catch {
      this.avisos.error('No se pudieron guardar las cuentas en este navegador. Los cambios se perderán al recargar.');
    }
  }
}
