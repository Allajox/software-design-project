import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { API_CONFIG } from '../../core/config/api.config';
import { TODOS_LOS_ROLES } from '../../core/config/roles.config';
import { ROL_DESCRIPCION, ROL_ETIQUETA, RolUsuario } from '../../core/models/auth.models';
import { AuthService } from '../../core/services/auth.service';
import { AvisosService } from '../../core/services/avisos.service';
import { ConsultasService } from '../../core/services/consultas.service';
import { UsuariosService } from '../../core/services/usuarios.service';
import {
  FILTRO_CUENTAS_VACIO, filtrarCuentas, matrizPermisos, motivoNoDesactivar, motivoNoEliminar, ordenarCuentas,
} from '../../core/usuarios/usuarios';
import { CuentaPublica, FiltroCuentas, FiltroEstado } from '../../core/usuarios/usuarios.models';
import { MENU } from '../../layout/menu.config';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { fmtEntero, fmtFechaHora } from '../../shared/utils/formato';
import { CuentaGuardada, DialogoUsuarioComponent } from './dialogo-usuario.component';

/** Una fila lista para mostrar: la cuenta más lo que la pantalla necesita saber de ella */
interface FilaCuenta extends CuentaPublica {
  iniciales: string;
  rolEtiqueta: string;
  acceso: string;
  esActual: boolean;
  /** Por qué NO se puede desactivar / eliminar (null = se puede) */
  motivoDesactivar: string | null;
  motivoEliminar: string | null;
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
 * Usuarios y roles (RF-9): lista de cuentas con búsqueda, alta y edición, activar/desactivar,
 * eliminar, y un cuadro de qué puede hacer cada rol. Solo para el Administrador.
 * Las reglas (último administrador, validaciones) están en `core/usuarios/usuarios.ts`.
 */
@Component({
  selector: 'app-usuarios',
  imports: [IconComponent, ModalComponent, DialogoUsuarioComponent],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss',
})
export class UsuariosComponent {
  private readonly auth = inject(AuthService);
  private readonly servicio = inject(UsuariosService);
  private readonly consultas = inject(ConsultasService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);

  protected readonly fmtEntero = fmtEntero;
  protected readonly roles = TODOS_LOS_ROLES;
  protected readonly etiqueta = ROL_ETIQUETA;
  protected readonly descripcion = ROL_DESCRIPCION;
  protected readonly modoDemo = API_CONFIG.useMock;
  /** Qué pantalla ve cada rol: sale del mismo MENU que arma el menú lateral */
  protected readonly permisos = matrizPermisos(MENU);

  protected readonly idActual = computed(() => this.auth.usuario()?.id);
  protected readonly resumen = this.servicio.resumen;

  protected readonly filtro = signal<FiltroCuentas>(FILTRO_CUENTAS_VACIO);
  protected readonly hayFiltro = computed(() => {
    const f = this.filtro();
    return f.texto.trim() !== '' || f.rol !== '' || f.estado !== 'todos';
  });

  protected readonly filas = computed<FilaCuenta[]>(() => {
    const todas = this.servicio.cuentas();
    const actual = this.idActual();
    return ordenarCuentas(filtrarCuentas(todas, this.filtro())).map((c) => ({
      ...c,
      iniciales: iniciales(c.nombre),
      rolEtiqueta: ROL_ETIQUETA[c.rol],
      acceso: c.ultimoAcceso ? fmtFechaHora(c.ultimoAcceso) : 'Nunca ha entrado',
      esActual: c.id === actual,
      motivoDesactivar: c.activo ? motivoNoDesactivar(c.id, todas, actual) : null,
      motivoEliminar: motivoNoEliminar(c.id, todas, actual),
    }));
  });

  /** Cuenta en edición (null = formulario de cuenta nueva); `abierto` dice si el formulario se ve */
  protected readonly dialogoAbierto = signal(false);
  protected readonly cuentaEnEdicion = signal<CuentaPublica | null>(null);
  protected readonly confirmacion = signal<Confirmacion | null>(null);

  // ----- Filtros -----

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

  // ----- Crear / editar -----

  protected nueva(): void {
    this.cuentaEnEdicion.set(null);
    this.dialogoAbierto.set(true);
  }

  protected editar(f: FilaCuenta): void {
    this.cuentaEnEdicion.set(this.servicio.cuentaPorId(f.id) ?? null);
    this.dialogoAbierto.set(true);
  }

  protected alGuardar({ cuenta, creada }: CuentaGuardada): void {
    this.dialogoAbierto.set(false);
    // Si se editó la propia cuenta, la sesión debe reflejar el nombre o correo nuevos
    this.auth.sincronizarSesion();
    this.avisos.exito(creada ? `Cuenta de ${cuenta.nombre} creada.` : `Cambios en la cuenta de ${cuenta.nombre} guardados.`);
  }

  // ----- Activar / desactivar -----

  protected alternar(f: FilaCuenta): void {
    // El botón se ve «apagado» pero sigue enfocable (aria-disabled): al pulsarlo se explica el motivo
    if (f.motivoDesactivar) {
      this.avisos.error(f.motivoDesactivar);
      return;
    }
    const motivo = this.servicio.alternarActivo(f.id, this.idActual());
    if (motivo) {
      this.avisos.error(motivo);
      return;
    }
    this.avisos.exito(f.activo ? `Cuenta de ${f.nombre} desactivada. Ya no puede entrar.` : `Cuenta de ${f.nombre} reactivada.`);
  }

  // ----- Eliminar (siempre con confirmación) -----

  protected pedirEliminar(f: FilaCuenta): void {
    if (f.motivoEliminar) {
      this.avisos.error(f.motivoEliminar);
      return;
    }
    this.confirmacion.set({
      titulo: 'Eliminar cuenta',
      mensaje:
        `¿Eliminar la cuenta de ${f.nombre} (${f.correo})? Se borran también sus consultas guardadas en este navegador ` +
        'y no se puede deshacer. Si solo quiere impedir que entre, use «Desactivar».',
      boton: 'Eliminar cuenta',
      accion: () => {
        const motivo = this.servicio.eliminar(f.id, this.idActual());
        if (motivo) {
          this.avisos.error(motivo);
          return;
        }
        this.consultas.olvidarUsuario(f.id);
        this.avisos.exito(`Cuenta de ${f.nombre} eliminada.`);
      },
    });
  }

  // ----- Datos de demostración -----

  protected pedirRestablecer(): void {
    this.confirmacion.set({
      titulo: 'Restablecer cuentas de demostración',
      mensaje:
        'Se borran todas las cuentas que haya creado y vuelven las tres de demostración con sus contraseñas originales. ' +
        'Si usted entró con una cuenta creada por usted, se cerrará su sesión.',
      boton: 'Restablecer',
      accion: () => {
        const antes = this.servicio.cuentas().map((c) => c.id);
        this.servicio.restablecerDemo();
        const despues = new Set(this.servicio.cuentas().map((c) => c.id));
        const sesionVigente = this.auth.sincronizarSesion();
        antes.filter((id) => !despues.has(id)).forEach((id) => this.consultas.olvidarUsuario(id));
        if (sesionVigente) {
          this.avisos.exito('Cuentas de demostración restablecidas.');
        } else {
          void this.router.navigate(['/login']);
        }
      },
    });
  }

  protected ejecutarConfirmacion(): void {
    this.confirmacion()?.accion();
    this.confirmacion.set(null);
  }
}
