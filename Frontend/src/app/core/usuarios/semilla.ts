import { AlmacenUsuarios, CuentaUsuario } from './usuarios.models';

/**
 * SOLO PARA DESARROLLO: las tres cuentas de demostración con las que arranca el sistema.
 * Las claves ya están convertidas en hash (Admin123, Analista123 y Consulta123, las mismas que
 * muestra la pantalla de login). Cuando exista el backend, este archivo se borra: las cuentas
 * viven en la base de datos del servidor.
 */
const CUENTAS_DEMO: Omit<CuentaUsuario, 'creadoEn'>[] = [
  {
    id: 1, nombre: 'Ana Administradora', correo: 'admin@sivcr.go.cr', rol: 'ADMIN', activo: true, ultimoAcceso: null,
    clave: 'pbkdf2-sha256$120000$MR0Q1xyzZ2kheopAjsVZRg==$URdU8CpDXp0mi5u2a483qxmQnx7W66d83bNDHOaUAxs=',
  },
  {
    id: 2, nombre: 'Luis Analista', correo: 'analista@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', activo: true, ultimoAcceso: null,
    clave: 'pbkdf2-sha256$120000$ffyeUSn2SuZ91gC16ZHD3A==$Wogf5t1WwBLcQj7NHESPt75QhYWIEptJxMXnEP26chU=',
  },
  {
    id: 3, nombre: 'Carla Consultora', correo: 'consultor@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO', activo: true, ultimoAcceso: null,
    clave: 'pbkdf2-sha256$120000$ORJsTgtuPk8YKfm8vJWJWg==$7ULhX6tRZc4dbQLfLLzZqo6kqBkAtyEGHd/LGBf6vO8=',
  },
];

/** Almacén de arranque: «creada» es el momento en que se inicializó el navegador, no una fecha inventada */
export function crearAlmacenInicial(ahoraIso: string): AlmacenUsuarios {
  return {
    version: 1,
    proximoId: CUENTAS_DEMO.length + 1,
    cuentas: CUENTAS_DEMO.map((c) => ({ ...c, creadoEn: ahoraIso })),
  };
}

/** La cuenta administradora de demostración (para recuperar el acceso si el almacén queda sin administradores) */
export function adminDemo(ahoraIso: string): CuentaUsuario {
  return { ...CUENTAS_DEMO[0], creadoEn: ahoraIso };
}
