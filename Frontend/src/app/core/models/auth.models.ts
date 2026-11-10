import { API_CONFIG } from '../config/api.config';

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

/** Qué puede hacer cada perfil, en una frase (se muestra al elegir el rol de una cuenta) */
export const ROL_DESCRIPCION: Record<RolUsuario, string> = API_CONFIG.datosReales
  ? {
      ADMIN: 'Gestiona cuentas, roles y la configuración del ISS, carga datos y entra a todas las pantallas del sistema.',
      ANALISTA_TRANSITO: 'Analiza siniestros con el dashboard, el explorador de registros y el historial de consultas. No carga datos ni gestiona cuentas.',
      CONSULTOR_PUBLICO: 'Solo ve la vista pública: totales nacionales de siniestros, sin filtros ni datos de personas.',
    }
  : {
      ADMIN: 'Gestiona cuentas y roles, y entra a todas las pantallas del sistema.',
      ANALISTA_TRANSITO: 'Analiza siniestros, carga datos y usa hotspots, predicción de riesgo y simulador. No gestiona cuentas.',
      CONSULTOR_PUBLICO: 'Solo consulta: dashboard y explorador de registros. No carga datos ni usa la predicción.',
    };
