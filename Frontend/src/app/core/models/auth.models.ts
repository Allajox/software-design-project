export type RolUsuario = 'ADMIN' | 'ANALISTA_TRANSITO' | 'CONSULTOR_PUBLICO';

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

export interface LoginRequest {
  correo: string;
  contrasena: string;
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}

export const ROL_ETIQUETA: Record<RolUsuario, string> = {
  ADMIN: 'Administrador',
  ANALISTA_TRANSITO: 'Analista de Tránsito',
  CONSULTOR_PUBLICO: 'Consultor Público',
};
