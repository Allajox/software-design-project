import { RolUsuario } from '../models/auth.models';

/** Cuenta tal como se guarda (incluye la clave ya convertida en hash: nunca la contraseña) */
export interface CuentaUsuario {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
  /** Resultado de `hashearContrasena`, con el formato «pbkdf2-sha256$iteraciones$sal$hash» */
  clave: string;
  /** Fecha ISO */
  creadoEn: string;
  /** Fecha ISO del último ingreso; null si nunca ha entrado */
  ultimoAcceso: string | null;
}

/** Lo que ve la pantalla: la cuenta sin la clave */
export type CuentaPublica = Omit<CuentaUsuario, 'clave'>;

/** Todo lo que se guarda en el almacenamiento del navegador */
export interface AlmacenUsuarios {
  version: 1;
  /** Siguiente id a entregar. Nunca baja: así un id eliminado no se reutiliza (heredaría sus consultas guardadas) */
  proximoId: number;
  cuentas: CuentaUsuario[];
}

/** Datos del formulario de crear / editar */
export interface DatosFormularioUsuario {
  nombre: string;
  correo: string;
  rol: RolUsuario;
  /** Al crear es obligatoria; al editar, vacía significa «no cambiarla» */
  contrasena: string;
}

export type CampoFormularioUsuario = 'nombre' | 'correo' | 'rol' | 'contrasena';
export type ErroresFormularioUsuario = Partial<Record<CampoFormularioUsuario, string>>;

export type FiltroEstado = 'todos' | 'activos' | 'desactivados';

export interface FiltroCuentas {
  texto: string;
  rol: RolUsuario | '';
  estado: FiltroEstado;
}
