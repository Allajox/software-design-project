import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TODOS_LOS_ROLES } from '../../core/config/roles.config';
import { ROL_DESCRIPCION, ROL_ETIQUETA, RolUsuario } from '../../core/models/auth.models';
import { AvisosService } from '../../core/services/avisos.service';
import { ResultadoGuardado, UsuariosService } from '../../core/services/usuarios.service';
import { enteroAleatorio } from '../../core/usuarios/credenciales';
import {
  LARGO_MAX_CLAVE, LARGO_MAX_CORREO, LARGO_MAX_NOMBRE, generarContrasena, motivoNoCambiarRol, requisitosContrasena,
} from '../../core/usuarios/usuarios';
import {
  CampoFormularioUsuario, CuentaPublica, DatosFormularioUsuario, ErroresFormularioUsuario,
} from '../../core/usuarios/usuarios.models';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';

export interface CuentaGuardada {
  cuenta: CuentaPublica;
  creada: boolean;
}

/**
 * Quién guarda la cuenta. Sin él, el diálogo usa las cuentas de demostración del navegador (UsuariosService); con el
 * servidor real, la pantalla pasa uno que llama a la API (`idEditando` indefinido = cuenta nueva).
 */
export type GuardadorCuenta = (datos: DatosFormularioUsuario, idEditando: number | undefined) => Promise<ResultadoGuardado>;

let contador = 0;

/**
 * Formulario para crear una cuenta o editar una existente. Valida con las funciones puras de
 * `core/usuarios` (a través de UsuariosService) y deja los errores junto a cada campo.
 */
@Component({
  selector: 'app-dialogo-usuario',
  imports: [ModalComponent, IconComponent],
  template: `
    <app-modal [abierto]="abierto()" [titulo]="editando() ? 'Editar cuenta' : 'Nueva cuenta'" (cerrar)="cerrar.emit()">
      <form (submit)="enviar($event)" novalidate autocomplete="off">
        @if (errorGeneral()) {
          <p class="error general" role="alert">{{ errorGeneral() }}</p>
        }

        <div class="campo">
          <label [for]="id('nombre')">Nombre completo</label>
          <input
            [id]="id('nombre')" type="text" autofocus autocomplete="off" [maxLength]="largoNombre"
            [value]="nombre()" (input)="escribir('nombre', $event)"
            [attr.aria-invalid]="errores().nombre ? 'true' : null"
            [attr.aria-describedby]="errores().nombre ? id('nombre-error') : null"
            placeholder="Ej.: Marta Ruiz Mora"
          />
          @if (errores().nombre) { <p class="error" [id]="id('nombre-error')" role="alert">{{ errores().nombre }}</p> }
        </div>

        <div class="campo">
          <label [for]="id('correo')">Correo electrónico (es su usuario para entrar)</label>
          <input
            [id]="id('correo')" type="email" autocomplete="off" [maxLength]="largoCorreo"
            [value]="correo()" (input)="escribir('correo', $event)"
            [attr.aria-invalid]="errores().correo ? 'true' : null"
            [attr.aria-describedby]="errores().correo ? id('correo-error') : null"
            placeholder="nombre@institucion.go.cr"
          />
          @if (errores().correo) { <p class="error" [id]="id('correo-error')" role="alert">{{ errores().correo }}</p> }
        </div>

        <fieldset class="roles" [attr.aria-describedby]="motivoRol() ? id('rol-nota') : null">
          <legend>Rol</legend>
          @for (r of roles; track r) {
            <label class="rol-opcion" [class.activa]="rol() === r" [class.bloqueada]="rolBloqueado() && r !== rolOriginal()">
              <input type="radio" [name]="id('rol')" [value]="r" [checked]="rol() === r"
                     [disabled]="rolBloqueado() && r !== rolOriginal()" (change)="rol.set(r)" />
              <span class="rol-nombre">{{ etiqueta[r] }}</span>
              <span class="rol-desc">{{ descripcion[r] }}</span>
            </label>
          }
        </fieldset>
        @if (motivoRol()) { <p class="nota" [id]="id('rol-nota')">{{ motivoRol() }}</p> }
        @if (errores().rol) { <p class="error" role="alert">{{ errores().rol }}</p> }

        <div class="campo">
          <label [for]="id('contrasena')">{{ editando() ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</label>
          <div class="clave-fila">
            <input
              [id]="id('contrasena')" [type]="verClave() ? 'text' : 'password'" autocomplete="new-password" [maxLength]="largoClave"
              [value]="contrasena()" (input)="escribir('contrasena', $event)"
              [attr.aria-invalid]="errores().contrasena ? 'true' : null"
              [attr.aria-describedby]="id('contrasena-ayuda')"
              [placeholder]="editando() ? 'Déjela vacía para conservar la actual' : ''"
            />
            <button type="button" class="mini" (click)="verClave.set(!verClave())" [attr.aria-pressed]="verClave()">
              {{ verClave() ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
          @if (errores().contrasena) { <p class="error" role="alert">{{ errores().contrasena }}</p> }
          <div class="clave-acciones">
            <button type="button" class="mini" (click)="generar()">Generar contraseña temporal</button>
            @if (contrasena()) {
              <button type="button" class="mini" (click)="copiar()">Copiar</button>
            }
          </div>
          <div [id]="id('contrasena-ayuda')">
            @if (!editando() || contrasena()) {
              <ul class="requisitos" aria-label="Condiciones de la contraseña">
                @for (q of requisitos(); track q.id) {
                  <li [class.cumple]="q.cumple">
                    <span aria-hidden="true">{{ q.cumple ? '✓' : '○' }}</span>
                    <span class="solo-lectores">{{ q.cumple ? 'Cumple:' : 'Falta:' }}</span>
                    {{ q.texto }}
                  </li>
                }
              </ul>
            }
            <p class="nota">
              Entregue la contraseña por un medio seguro, no por correo común. Por ahora solo una persona administradora puede cambiar contraseñas.
            </p>
          </div>
        </div>
        <button type="submit" hidden>Guardar</button>
      </form>

      <div acciones>
        <button type="button" class="secundario" (click)="cerrar.emit()">Cancelar</button>
        <button type="button" class="principal" [disabled]="guardando()" (click)="enviar()">
          <app-icon name="guardar" /> {{ guardando() ? 'Guardando…' : editando() ? 'Guardar cambios' : 'Crear cuenta' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .campo { margin-top: 0.8rem; }
    .campo:first-of-type { margin-top: 0.3rem; }
    label, legend { display: block; margin-bottom: 4px; font-size: 0.8rem; font-weight: 600; color: var(--gris); }
    input[type='text'], input[type='email'], input[type='password'] {
      width: 100%; padding: 9px 10px; font: inherit; color: var(--texto); background: #fff;
      border: 1px solid var(--borde); border-radius: 8px;
    }
    input:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 1px; }
    input[aria-invalid='true'] { border-color: var(--rojo); }
    .error { margin: 6px 0 0; font-size: 0.82rem; color: var(--rojo); }
    .error.general { padding: 8px 10px; background: #fdeeee; border: 1px solid #e3b4b4; border-radius: 8px; }
    .nota { margin: 6px 0 0; font-size: 0.78rem; line-height: 1.4; color: var(--gris); }

    .roles { min-width: 0; margin: 0.9rem 0 0; padding: 0; border: 0; }
    .rol-opcion {
      position: relative; display: grid; gap: 1px; margin: 0 0 6px; padding: 8px 12px 8px 36px;
      font-weight: 400; color: var(--texto); background: #fff; border: 1px solid var(--borde); border-radius: 10px; cursor: pointer;
    }
    .rol-opcion input { position: absolute; top: 12px; left: 12px; margin: 0; accent-color: var(--azul-claro); }
    .rol-opcion:hover:not(.bloqueada) { border-color: var(--azul-claro); }
    .rol-opcion:has(input:focus-visible) { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
    .rol-opcion.activa { background: #eef4fd; border-color: var(--azul-claro); }
    .rol-opcion.bloqueada { color: var(--gris); background: var(--fondo); cursor: not-allowed; }
    .rol-nombre { font-size: 0.9rem; font-weight: 600; }
    .rol-desc { font-size: 0.78rem; color: var(--gris); }

    .clave-fila { display: flex; gap: 6px; }
    .clave-acciones { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .mini {
      padding: 6px 10px; font: inherit; font-size: 0.8rem; font-weight: 600; white-space: nowrap;
      color: var(--azul-claro); background: #fff; border: 1px solid var(--azul-claro); border-radius: 8px; cursor: pointer;
    }
    .mini:hover { background: #eef4fd; }
    .mini:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }

    .requisitos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 10px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 0.78rem; color: var(--gris); }
    .requisitos li.cumple { color: #1b5e20; font-weight: 600; }

    button { font: inherit; }
    .secundario, .principal { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font-weight: 600; border-radius: 8px; cursor: pointer; }
    .secundario { color: var(--gris); background: #fff; border: 1px solid var(--borde); }
    .principal { color: #fff; background: var(--azul-claro); border: 1px solid var(--azul-claro); }
    .principal app-icon { width: 15px; height: 15px; }
    .principal:disabled { opacity: 0.6; cursor: progress; }
    .secundario:focus-visible, .principal:focus-visible { outline: 2px solid var(--azul-claro); outline-offset: 2px; }
  `,
})
export class DialogoUsuarioComponent {
  private readonly servicio = inject(UsuariosService);
  private readonly avisos = inject(AvisosService);
  private readonly prefijo = `usuario-${++contador}`;

  readonly abierto = input(false);
  /** La cuenta que se edita; null para crear una nueva */
  readonly cuenta = input<CuentaPublica | null>(null);
  /** Quien está usando la pantalla (para las reglas «nadie cambia su propio rol») */
  readonly idActual = input<number | undefined>(undefined);
  /** Las cuentas que existen (para la regla del último administrador); sin ellas se usan las de demostración */
  readonly cuentas = input<readonly CuentaPublica[] | null>(null);
  /** Quién guarda; sin él se usa la demostración (ver GuardadorCuenta) */
  readonly guardador = input<GuardadorCuenta | null>(null);

  readonly guardado = output<CuentaGuardada>();
  readonly cerrar = output<void>();

  protected readonly roles = TODOS_LOS_ROLES;
  protected readonly etiqueta = ROL_ETIQUETA;
  protected readonly descripcion = ROL_DESCRIPCION;
  protected readonly largoNombre = LARGO_MAX_NOMBRE;
  protected readonly largoCorreo = LARGO_MAX_CORREO;
  protected readonly largoClave = LARGO_MAX_CLAVE;

  protected readonly nombre = signal('');
  protected readonly correo = signal('');
  protected readonly rol = signal<RolUsuario>('CONSULTOR_PUBLICO');
  protected readonly contrasena = signal('');
  protected readonly verClave = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<ErroresFormularioUsuario>({});
  protected readonly errorGeneral = signal<string | null>(null);

  protected readonly editando = computed(() => this.cuenta() !== null);
  protected readonly rolOriginal = computed(() => this.cuenta()?.rol);
  protected readonly requisitos = computed(() => requisitosContrasena(this.contrasena()));

  /** Por qué no se puede cambiar el rol de esta cuenta (es ella misma, o es la única administradora) */
  protected readonly motivoRol = computed(() => {
    const c = this.cuenta();
    if (!c || c.rol !== 'ADMIN') return null;
    return motivoNoCambiarRol(c.id, 'ANALISTA_TRANSITO', this.cuentas() ?? this.servicio.cuentas(), this.idActual());
  });
  protected readonly rolBloqueado = computed(() => this.motivoRol() !== null);

  constructor() {
    // Cada vez que se abre, empieza con los datos de la cuenta (o vacío)
    effect(() => {
      if (!this.abierto()) return;
      const c = this.cuenta();
      untracked(() => {
        this.nombre.set(c?.nombre ?? '');
        this.correo.set(c?.correo ?? '');
        this.rol.set(c?.rol ?? 'CONSULTOR_PUBLICO');
        this.contrasena.set('');
        this.verClave.set(false);
        this.errores.set({});
        this.errorGeneral.set(null);
        this.guardando.set(false);
      });
    });
  }

  protected id(parte: string): string {
    return `${this.prefijo}-${parte}`;
  }

  protected escribir(campo: Exclude<CampoFormularioUsuario, 'rol'>, e: Event): void {
    const valor = (e.target as HTMLInputElement).value;
    this[campo].set(valor);
    // Al corregir un campo, su error desaparece
    if (this.errores()[campo]) this.errores.update(({ [campo]: _quitado, ...resto }) => resto);
    if (this.errorGeneral()) this.errorGeneral.set(null);
  }

  protected generar(): void {
    this.contrasena.set(generarContrasena(enteroAleatorio));
    this.verClave.set(true); // se muestra para poder anotarla o copiarla
    this.errores.update(({ contrasena: _quitado, ...resto }) => resto);
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.contrasena());
      this.avisos.info('Contraseña copiada. Péguela en un medio seguro.');
    } catch {
      this.avisos.error('No se pudo copiar. Selecciónela y cópiela a mano.');
    }
  }

  protected async enviar(e?: Event): Promise<void> {
    e?.preventDefault();
    if (this.guardando()) return;

    const datos = { nombre: this.nombre(), correo: this.correo(), rol: this.rol(), contrasena: this.contrasena() };
    const cuenta = this.cuenta();
    this.guardando.set(true);
    const guardar = this.guardador();
    const r = guardar
      ? await guardar(datos, cuenta?.id)
      : cuenta
        ? await this.servicio.actualizar(cuenta.id, datos, this.idActual())
        : await this.servicio.crear(datos);
    this.guardando.set(false);

    if (!r.ok) {
      this.errores.set(r.errores);
      this.errorGeneral.set(r.general ?? null);
      const primero = (['nombre', 'correo', 'contrasena'] as const).find((c) => r.errores[c]);
      if (primero) setTimeout(() => document.getElementById(this.id(primero))?.focus());
      return;
    }
    this.guardado.emit({ cuenta: r.cuenta, creada: !cuenta });
  }
}
