import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  CALZADAS_CONFIG, CLIMAS_CONFIG, ErroresConfig, FormularioConfig, PESOS, aFormulario, formulaIss, hayCambiosAdversas,
  hayCambiosPesos, opcionesConDesconocidas, validarConfig, ClavePeso,
} from '../../core/api/configuracion-api';
import { ConfiguracionApiService } from '../../core/api/configuracion-api.service';
import { UsuariosApiService } from '../../core/api/usuarios-api.service';
import { TODOS_LOS_ROLES } from '../../core/config/roles.config';
import { ROL_ETIQUETA, RolUsuario } from '../../core/models/auth.models';
import { AuthService } from '../../core/services/auth.service';
import { AvisosService } from '../../core/services/avisos.service';
import { enteroAleatorio } from '../../core/usuarios/credenciales';
import {
  FILTRO_CUENTAS_VACIO, LARGO_MAX_CLAVE, LARGO_MAX_CORREO, LARGO_MAX_NOMBRE, filtrarCuentas, generarContrasena,
  motivoNoDesactivar, ordenarCuentas,
} from '../../core/usuarios/usuarios';
import { CuentaPublica, ErroresFormularioUsuario, FiltroCuentas, FiltroEstado } from '../../core/usuarios/usuarios.models';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { fmtEntero, fmtFecha } from '../../shared/utils/formato';
import { CuentaGuardada, DialogoUsuarioComponent, GuardadorCuenta } from '../usuarios/dialogo-usuario.component';

interface FilaCuenta extends CuentaPublica {
  iniciales: string;
  rolEtiqueta: string;
  alta: string;
  esActual: boolean;
  /** Por qué NO se puede desactivar (null = se puede) */
  motivoDesactivar: string | null;
}

interface Confirmacion {
  titulo: string;
  mensaje: string;
  boton: string;
  accion: () => void;
}

const iniciales = (nombre: string): string =>
  nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/**
 * Usuarios y Configuración (HU 29, 30 y 31; solo ADMIN). Sigue el Figma: tres columnas, cada una con su botón de guardar.
 *  - Crear Usuario: nombre, correo, contraseña y rol (POST /api/users);
 *  - Peso del ISS: W1 fallecidos, W2 heridos graves y W3 heridos leves (PUT /api/config);
 *  - Condiciones Adversas: qué clima y qué calzada cuentan como adversos (PUT /api/config).
 * Debajo va la lista de cuentas para editarlas, activarlas y desactivarlas (HU 31).
 * El PUT /api/config reemplaza la configuración completa; por eso cada botón envía lo que tiene guardado la otra columna
 * (los cambios sin guardar de la otra columna no viajan) y, mientras uno guarda, el otro espera.
 * El servidor es quien manda: verifica el rol en cada petición y repite todas las validaciones; lo que se revisa aquí
 * solo ahorra el viaje y deja el aviso junto al campo.
 */
@Component({
  selector: 'app-usuarios-api',
  imports: [IconComponent, ModalComponent, DialogoUsuarioComponent],
  templateUrl: './usuarios-api.component.html',
  styleUrl: './usuarios-api.component.scss',
})
export class UsuariosApiComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly avisos = inject(AvisosService);
  protected readonly cuentasApi = inject(UsuariosApiService);
  protected readonly configApi = inject(ConfiguracionApiService);

  protected readonly fmtEntero = fmtEntero;
  protected readonly roles = TODOS_LOS_ROLES;
  protected readonly etiqueta = ROL_ETIQUETA;
  protected readonly pesos = PESOS;

  // ---------- Configuración del ISS ----------

  /** Lo que la persona tiene escrito (null mientras no llegue la configuración del servidor) */
  protected readonly formulario = signal<FormularioConfig | null>(null);
  protected readonly erroresPesos = signal<ErroresConfig>({});
  protected readonly errorAdversas = signal<string | null>(null);
  /** Qué parte se está guardando (null = ninguna); mientras tanto no se puede guardar la otra */
  protected readonly guardandoConfig = signal<'pesos' | 'adversas' | null>(null);

  protected readonly pesosCambiados = computed(() => {
    const guardada = this.configApi.vigente();
    const f = this.formulario();
    return !!guardada && !!f && hayCambiosPesos(guardada, f);
  });
  protected readonly adversasCambiadas = computed(() => {
    const guardada = this.configApi.vigente();
    const f = this.formulario();
    return !!guardada && !!f && hayCambiosAdversas(guardada, f);
  });
  protected readonly formula = computed(() => {
    const f = this.formulario();
    return f ? formulaIss(f) : '';
  });
  protected readonly opcionesClima = computed(() =>
    opcionesConDesconocidas(CLIMAS_CONFIG, this.formulario()?.climaAdverso ?? []));
  protected readonly opcionesCalzada = computed(() =>
    opcionesConDesconocidas(CALZADAS_CONFIG, this.formulario()?.calzadaAdversa ?? []));

  // ---------- Crear usuario ----------

  protected readonly largoNombre = LARGO_MAX_NOMBRE;
  protected readonly largoCorreo = LARGO_MAX_CORREO;
  protected readonly largoClave = LARGO_MAX_CLAVE;

  protected readonly nuevoNombre = signal('');
  protected readonly nuevoCorreo = signal('');
  protected readonly nuevaClave = signal('');
  /** Sin permisos de más: quien no se elija otro rol queda como consultor público */
  protected readonly nuevoRol = signal<RolUsuario>('CONSULTOR_PUBLICO');
  protected readonly verClave = signal(false);
  protected readonly erroresNuevo = signal<ErroresFormularioUsuario>({});
  protected readonly errorNuevo = signal<string | null>(null);
  protected readonly creando = signal(false);

  // ---------- Cuentas ----------

  protected readonly idActual = computed(() => this.auth.usuario()?.id);
  protected readonly resumen = this.cuentasApi.resumen;

  protected readonly filtro = signal<FiltroCuentas>(FILTRO_CUENTAS_VACIO);
  protected readonly hayFiltro = computed(() => {
    const f = this.filtro();
    return f.texto.trim() !== '' || f.rol !== '' || f.estado !== 'todos';
  });

  protected readonly filas = computed<FilaCuenta[]>(() => {
    const todas = this.cuentasApi.cuentas();
    const actual = this.idActual();
    return ordenarCuentas(filtrarCuentas(todas, this.filtro())).map((c) => ({
      ...c,
      iniciales: iniciales(c.nombre),
      rolEtiqueta: ROL_ETIQUETA[c.rol],
      alta: fmtFecha(c.creadoEn),
      esActual: c.id === actual,
      motivoDesactivar: c.activo ? motivoNoDesactivar(c.id, todas, actual) : null,
    }));
  });

  protected readonly dialogoAbierto = signal(false);
  protected readonly cuentaEnEdicion = signal<CuentaPublica | null>(null);
  protected readonly confirmacion = signal<Confirmacion | null>(null);

  /** Se lo entrega al formulario de cuenta: crear (sin id) o editar (con id) en el servidor */
  protected readonly guardador: GuardadorCuenta = (datos, id) =>
    id === undefined ? this.cuentasApi.crear(datos) : this.cuentasApi.actualizar(id, datos, this.idActual());

  ngOnInit(): void {
    void this.cargarConfig();
    void this.cuentasApi.cargar();
  }

  // ===== Configuración =====

  /** Trae la configuración del servidor y reemplaza lo escrito (al abrir y al reintentar) */
  protected async cargarConfig(): Promise<void> {
    await this.configApi.cargar();
    const vigente = this.configApi.vigente();
    if (vigente) this.formulario.set(aFormulario(vigente));
    this.erroresPesos.set({});
    this.errorAdversas.set(null);
  }

  protected escribirPeso(clave: ClavePeso, valor: string): void {
    this.formulario.update((f) => (f ? { ...f, [clave]: valor } : f));
    if (this.erroresPesos()[clave] || this.erroresPesos().general) {
      this.erroresPesos.update(({ [clave]: _quitado, general: _general, ...resto }) => resto);
    }
  }

  protected marcar(grupo: 'climaAdverso' | 'calzadaAdversa', valor: string, marcado: boolean): void {
    this.formulario.update((f) => {
      if (!f) return f;
      const sin = f[grupo].filter((v) => v !== valor);
      return { ...f, [grupo]: marcado ? [...sin, valor] : sin };
    });
    this.errorAdversas.set(null);
  }

  /** «Guardar Pesos»: envía los pesos escritos y las condiciones adversas que ya estaban guardadas */
  protected async guardarPesos(): Promise<void> {
    const f = this.formulario();
    const vigente = this.configApi.vigente();
    if (!f || !vigente || this.guardandoConfig()) return;
    const { errores, valor } = validarConfig({ ...f, climaAdverso: vigente.climaAdverso, calzadaAdversa: vigente.calzadaAdversa });
    this.erroresPesos.set(errores);
    if (!valor) {
      const primero = PESOS.find((p) => errores[p.clave]);
      if (primero) setTimeout(() => document.getElementById('peso-' + primero.clave)?.focus());
      return;
    }
    this.guardandoConfig.set('pesos');
    const r = await this.configApi.guardar(valor);
    this.guardandoConfig.set(null);
    if (!r.ok) {
      this.erroresPesos.set({ general: r.mensaje });
      return;
    }
    // Solo se refrescan los pesos: lo que se esté marcando en la otra columna sigue como estaba
    const guardada = aFormulario(r.config);
    this.formulario.update((a) => a && {
      ...a, wFallecido: guardada.wFallecido, wHeridoGrave: guardada.wHeridoGrave, wHeridoLeve: guardada.wHeridoLeve,
    });
    this.avisos.exito('Pesos guardados. El dashboard los usa desde su próxima consulta.');
  }

  /** «Guardar definición»: envía el clima y la calzada marcados y los pesos que ya estaban guardados */
  protected async guardarDefinicion(): Promise<void> {
    const f = this.formulario();
    const vigente = this.configApi.vigente();
    if (!f || !vigente || this.guardandoConfig()) return;
    const { valor } = validarConfig({ ...aFormulario(vigente), climaAdverso: f.climaAdverso, calzadaAdversa: f.calzadaAdversa });
    if (!valor) return; // no ocurre: el servidor solo guarda pesos válidos
    this.guardandoConfig.set('adversas');
    const r = await this.configApi.guardar(valor);
    this.guardandoConfig.set(null);
    if (!r.ok) {
      this.errorAdversas.set(r.mensaje);
      return;
    }
    const guardada = aFormulario(r.config);
    this.formulario.update((a) => a && { ...a, climaAdverso: guardada.climaAdverso, calzadaAdversa: guardada.calzadaAdversa });
    this.avisos.exito('Definición guardada. El dashboard la usa desde su próxima consulta.');
  }

  // ===== Crear usuario =====

  protected escribirNuevo(campo: 'nombre' | 'correo' | 'contrasena', valor: string): void {
    (campo === 'nombre' ? this.nuevoNombre : campo === 'correo' ? this.nuevoCorreo : this.nuevaClave).set(valor);
    // Al corregir un campo, su error desaparece
    if (this.erroresNuevo()[campo]) this.erroresNuevo.update(({ [campo]: _quitado, ...resto }) => resto);
    this.errorNuevo.set(null);
  }

  protected generarClave(): void {
    this.nuevaClave.set(generarContrasena(enteroAleatorio));
    this.verClave.set(true); // se muestra para poder anotarla y entregarla
    this.erroresNuevo.update(({ contrasena: _quitado, ...resto }) => resto);
  }

  protected async crearUsuario(): Promise<void> {
    if (this.creando()) return;
    this.creando.set(true);
    const r = await this.cuentasApi.crear({
      nombre: this.nuevoNombre(), correo: this.nuevoCorreo(), rol: this.nuevoRol(), contrasena: this.nuevaClave(),
    });
    this.creando.set(false);
    if (!r.ok) {
      this.erroresNuevo.set(r.errores);
      this.errorNuevo.set(r.general ?? null);
      const primero = (['nombre', 'correo', 'contrasena'] as const).find((c) => r.errores[c]);
      if (primero) setTimeout(() => document.getElementById(primero === 'contrasena' ? 'nuevo-contrasena' : 'nuevo-' + primero)?.focus());
      return;
    }
    this.nuevoNombre.set('');
    this.nuevoCorreo.set('');
    this.nuevaClave.set('');
    this.nuevoRol.set('CONSULTOR_PUBLICO');
    this.verClave.set(false);
    this.erroresNuevo.set({});
    this.errorNuevo.set(null);
    this.avisos.exito(`Cuenta de ${r.cuenta.nombre} creada.`);
  }

  // ===== Cuentas: filtros =====

  protected cambiarTexto(texto: string): void {
    this.filtro.update((f) => ({ ...f, texto }));
  }
  protected cambiarRol(valor: string): void {
    this.filtro.update((f) => ({ ...f, rol: valor as RolUsuario | '' }));
  }
  protected cambiarEstado(valor: string): void {
    this.filtro.update((f) => ({ ...f, estado: valor as FiltroEstado }));
  }
  protected limpiarFiltros(): void {
    this.filtro.set(FILTRO_CUENTAS_VACIO);
  }

  // ===== Cuentas: editar =====

  protected editar(f: FilaCuenta): void {
    this.cuentaEnEdicion.set(this.cuentasApi.cuentaPorId(f.id) ?? null);
    this.dialogoAbierto.set(true);
  }

  protected alGuardar({ cuenta }: CuentaGuardada): void {
    this.dialogoAbierto.set(false);
    // Si se editó la propia cuenta, la sesión debe mostrar el nombre o correo nuevos
    this.auth.actualizarIdentidad({ id: cuenta.id, nombre: cuenta.nombre, correo: cuenta.correo, rol: cuenta.rol });
    this.avisos.exito(`Cambios en la cuenta de ${cuenta.nombre} guardados.`);
  }

  // ===== Cuentas: activar y desactivar =====

  protected alternar(f: FilaCuenta): void {
    // El botón se ve «apagado» pero sigue enfocable (aria-disabled): al pulsarlo se explica el motivo
    if (f.motivoDesactivar) {
      this.avisos.error(f.motivoDesactivar);
      return;
    }
    if (!f.activo) {
      void this.cambiarActivo(f, true);
      return;
    }
    this.confirmacion.set({
      titulo: 'Desactivar cuenta',
      mensaje:
        `¿Desactivar la cuenta de ${f.nombre} (${f.correo})? Ya no podrá iniciar sesión y se cierran las sesiones que tenga ` +
        'abiertas. Sus consultas y su historial se conservan, y puede reactivarla cuando quiera.',
      boton: 'Desactivar cuenta',
      accion: () => void this.cambiarActivo(f, false),
    });
  }

  private async cambiarActivo(f: FilaCuenta, activo: boolean): Promise<void> {
    const r = await this.cuentasApi.cambiarActivo(f.id, activo);
    if (!r.ok) {
      this.avisos.error(r.mensaje);
      return;
    }
    this.avisos.exito(activo ? `Cuenta de ${f.nombre} reactivada.` : `Cuenta de ${f.nombre} desactivada. Ya no puede entrar.`);
  }

  protected ejecutarConfirmacion(): void {
    this.confirmacion()?.accion();
    this.confirmacion.set(null);
  }
}
