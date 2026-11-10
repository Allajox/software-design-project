import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { esHashValido } from '../usuarios/credenciales';
import { AuthService } from './auth.service';
import { UsuariosService } from './usuarios.service';

const CLAVE_ALMACEN = 'sivcr_usuarios';
const datos = (sobre: Partial<{ nombre: string; correo: string; rol: 'ADMIN' | 'ANALISTA_TRANSITO' | 'CONSULTOR_PUBLICO'; contrasena: string }> = {}) => ({
  nombre: 'Nueva Persona', correo: 'nueva@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' as const, contrasena: 'Clave1234', ...sobre,
});

function crearServicios() {
  TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  return { usuarios: TestBed.inject(UsuariosService), auth: TestBed.inject(AuthService) };
}

describe('UsuariosService + AuthService (RF-9)', () => {
  // Estas pruebas son de la versión de demostración (cuentas y login en el navegador); la real usa el servidor.
  const useMockOriginal = API_CONFIG.useMock;
  beforeEach(() => {
    API_CONFIG.useMock = true;
    localStorage.clear();
  });
  afterEach(() => {
    API_CONFIG.useMock = useMockOriginal;
    localStorage.clear();
  });

  describe('arranque', () => {
    it('empieza con las tres cuentas de demostración y no expone ninguna clave', () => {
      const { usuarios } = crearServicios();
      expect(usuarios.cuentas().map((c) => c.correo)).toEqual(['admin@sivcr.go.cr', 'analista@sivcr.go.cr', 'consultor@sivcr.go.cr']);
      for (const c of usuarios.cuentas()) expect('clave' in c).toBe(false);
    });

    it('lo guardado en el navegador tiene hashes y ninguna contraseña en texto plano', () => {
      crearServicios();
      const guardado = localStorage.getItem(CLAVE_ALMACEN) ?? '';
      expect(guardado).toContain('pbkdf2-sha256$');
      for (const clave of ['Admin123', 'Analista123', 'Consulta123']) expect(guardado).not.toContain(clave);
    });

    it('un almacén dañado se reemplaza por el de demostración', () => {
      localStorage.setItem(CLAVE_ALMACEN, '{esto no es json');
      const { usuarios } = crearServicios();
      expect(usuarios.cuentas()).toHaveLength(3);
    });

    it('un almacén que quedó sin administradoras activas recupera la de demostración', () => {
      crearServicios();
      const almacen = JSON.parse(localStorage.getItem(CLAVE_ALMACEN)!);
      almacen.cuentas = almacen.cuentas.map((c: { rol: string }) => (c.rol === 'ADMIN' ? { ...c, activo: false } : c));
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(almacen));
      TestBed.resetTestingModule();

      const { usuarios } = crearServicios();
      expect(usuarios.cuentas().find((c) => c.rol === 'ADMIN')?.activo).toBe(true);
    });

    it('cuentas manipuladas a mano (rol inventado, hash falso) se descartan al cargar', () => {
      crearServicios();
      const almacen = JSON.parse(localStorage.getItem(CLAVE_ALMACEN)!);
      almacen.cuentas.push(
        { ...almacen.cuentas[1], id: 50, correo: 'hacker@x.cr', rol: 'SUPERUSUARIO' },
        { ...almacen.cuentas[1], id: 51, correo: 'otro@x.cr', clave: 'Admin123' },
      );
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(almacen));
      TestBed.resetTestingModule();

      const { usuarios } = crearServicios();
      expect(usuarios.cuentas().map((c) => c.id)).toEqual([1, 2, 3]);
    });
  });

  describe('crear', () => {
    it('crea la cuenta activa, con el hash guardado, y persiste', async () => {
      const { usuarios } = crearServicios();
      const r = await usuarios.crear(datos({ nombre: '  Marta   Ruiz ', correo: ' MARTA@Sivcr.go.cr ' }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.cuenta).toMatchObject({ id: 4, nombre: 'Marta Ruiz', correo: 'marta@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', activo: true, ultimoAcceso: null });
      const guardada = JSON.parse(localStorage.getItem(CLAVE_ALMACEN)!).cuentas.find((c: { id: number }) => c.id === 4);
      expect(esHashValido(guardada.clave)).toBe(true);
      expect(JSON.stringify(guardada)).not.toContain('Clave1234');
    });

    it('rechaza datos inválidos y no crea nada', async () => {
      const { usuarios } = crearServicios();
      const r = await usuarios.crear(datos({ nombre: '', correo: 'malo', contrasena: 'x' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(['contrasena', 'correo', 'nombre']);
      expect(usuarios.cuentas()).toHaveLength(3);
    });

    it('rechaza un correo repetido', async () => {
      const { usuarios } = crearServicios();
      const r = await usuarios.crear(datos({ correo: 'ADMIN@sivcr.go.cr' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errores.correo).toMatch(/Ya existe/);
    });

    it('un doble clic (dos creaciones a la vez con el mismo correo) crea una sola cuenta', async () => {
      const { usuarios } = crearServicios();
      const [a, b] = await Promise.all([usuarios.crear(datos()), usuarios.crear(datos())]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect(usuarios.cuentas().filter((c) => c.correo === 'nueva@sivcr.go.cr')).toHaveLength(1);
    });

    it('un id eliminado no se vuelve a entregar (heredaría sus consultas guardadas)', async () => {
      const { usuarios } = crearServicios();
      const primera = await usuarios.crear(datos({ correo: 'a@sivcr.go.cr' }));
      expect(primera.ok && primera.cuenta.id).toBe(4);
      expect(usuarios.eliminar(4, 1)).toBeNull();
      const segunda = await usuarios.crear(datos({ correo: 'b@sivcr.go.cr' }));
      expect(segunda.ok && segunda.cuenta.id).toBe(5);
    });
  });

  describe('editar', () => {
    it('cambia nombre, correo y rol; con la contraseña vacía conserva la anterior', async () => {
      const { usuarios, auth } = crearServicios();
      const r = await usuarios.actualizar(3, datos({ nombre: 'Carla Mora', correo: 'carla@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: '' }), 1);
      expect(r.ok).toBe(true);
      expect(usuarios.cuentaPorId(3)).toMatchObject({ nombre: 'Carla Mora', correo: 'carla@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' });
      const sesion = await firstValueFrom(auth.login({ correo: 'carla@sivcr.go.cr', contrasena: 'Consulta123' }));
      expect(sesion.usuario.rol).toBe('ANALISTA_TRANSITO');
    });

    it('con una contraseña nueva, la vieja deja de servir y la nueva sirve', async () => {
      const { usuarios, auth } = crearServicios();
      const r = await usuarios.actualizar(2, datos({ nombre: 'Luis Analista', correo: 'analista@sivcr.go.cr', contrasena: 'NuevaClave9' }), 1);
      expect(r.ok).toBe(true);
      await expect(firstValueFrom(auth.login({ correo: 'analista@sivcr.go.cr', contrasena: 'Analista123' }))).rejects.toMatchObject({ status: 401 });
      const sesion = await firstValueFrom(auth.login({ correo: 'analista@sivcr.go.cr', contrasena: 'NuevaClave9' }));
      expect(sesion.usuario.id).toBe(2);
    });

    it('no deja usar el correo de otra cuenta, pero sí conservar el propio', async () => {
      const { usuarios } = crearServicios();
      const repetido = await usuarios.actualizar(2, datos({ correo: 'admin@sivcr.go.cr', contrasena: '' }), 1);
      expect(repetido.ok).toBe(false);
      const propio = await usuarios.actualizar(2, datos({ correo: 'analista@sivcr.go.cr', contrasena: '' }), 1);
      expect(propio.ok).toBe(true);
    });

    it('nadie puede cambiar su propio rol', async () => {
      const { usuarios } = crearServicios();
      const r = await usuarios.actualizar(1, datos({ nombre: 'Ana Administradora', correo: 'admin@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO', contrasena: '' }), 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errores.rol).toMatch(/propio rol/);
      expect(usuarios.cuentaPorId(1)?.rol).toBe('ADMIN');
    });

    it('no se puede quitar el rol a la única administradora, pero sí si hay otra', async () => {
      const { usuarios } = crearServicios();
      const bloqueada = await usuarios.actualizar(1, datos({ nombre: 'Ana Administradora', correo: 'admin@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: '' }), 2);
      expect(bloqueada.ok).toBe(false);

      await usuarios.crear(datos({ nombre: 'Otra Admin', correo: 'otra@sivcr.go.cr', rol: 'ADMIN' }));
      const permitida = await usuarios.actualizar(1, datos({ nombre: 'Ana Administradora', correo: 'admin@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: '' }), 4);
      expect(permitida.ok).toBe(true);
    });

    it('editar una cuenta que ya no existe da un error claro', async () => {
      const { usuarios } = crearServicios();
      const r = await usuarios.actualizar(99, datos(), 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.general).toMatch(/ya no existe/);
    });
  });

  describe('desactivar, activar y eliminar', () => {
    it('desactiva y reactiva', () => {
      const { usuarios } = crearServicios();
      expect(usuarios.alternarActivo(3, 1)).toBeNull();
      expect(usuarios.cuentaPorId(3)?.activo).toBe(false);
      expect(usuarios.resumen().desactivadas).toBe(1);
      expect(usuarios.alternarActivo(3, 1)).toBeNull();
      expect(usuarios.cuentaPorId(3)?.activo).toBe(true);
    });

    it('nadie se desactiva ni se elimina a sí mismo, ni a la única administradora', () => {
      const { usuarios } = crearServicios();
      expect(usuarios.alternarActivo(1, 1)).toMatch(/propia cuenta/);
      expect(usuarios.alternarActivo(1, 2)).toMatch(/única persona administradora/);
      expect(usuarios.eliminar(1, 1)).toMatch(/propia cuenta/);
      expect(usuarios.eliminar(1, 2)).toMatch(/única persona administradora/);
      expect(usuarios.cuentaPorId(1)?.activo).toBe(true);
    });

    it('elimina de verdad y persiste', () => {
      const { usuarios } = crearServicios();
      expect(usuarios.eliminar(3, 1)).toBeNull();
      expect(usuarios.cuentaPorId(3)).toBeUndefined();
      expect(JSON.parse(localStorage.getItem(CLAVE_ALMACEN)!).cuentas).toHaveLength(2);
    });

    it('los cambios sobreviven a una recarga', () => {
      const { usuarios } = crearServicios();
      usuarios.alternarActivo(3, 1);
      TestBed.resetTestingModule();
      expect(crearServicios().usuarios.cuentaPorId(3)?.activo).toBe(false);
    });

    it('restablecer vuelve a las tres cuentas de demostración', async () => {
      const { usuarios } = crearServicios();
      await usuarios.crear(datos());
      usuarios.eliminar(3, 1);
      usuarios.restablecerDemo();
      expect(usuarios.cuentas().map((c) => c.id)).toEqual([1, 2, 3]);
    });
  });

  describe('inicio de sesión contra las cuentas', () => {
    it('entra con las credenciales de demostración, con el rol de la cuenta, y anota el último acceso', async () => {
      const { usuarios, auth } = crearServicios();
      expect(usuarios.cuentaPorId(2)?.ultimoAcceso).toBeNull();
      const r = await firstValueFrom(auth.login({ correo: ' ANALISTA@sivcr.go.cr ', contrasena: 'Analista123' }));
      expect(r.usuario).toEqual({ id: 2, nombre: 'Luis Analista', correo: 'analista@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' });
      expect(auth.tieneRol(['ANALISTA_TRANSITO'])).toBe(true);
      expect(usuarios.cuentaPorId(2)?.ultimoAcceso).not.toBeNull();
    });

    it('correo inexistente y contraseña incorrecta dan exactamente el mismo error (no revela qué correos existen)', async () => {
      const { auth } = crearServicios();
      const sinCorreo = await firstValueFrom(auth.login({ correo: 'nadie@sivcr.go.cr', contrasena: 'Admin123' })).catch((e) => e);
      const malaClave = await firstValueFrom(auth.login({ correo: 'admin@sivcr.go.cr', contrasena: 'Equivocada1' })).catch((e) => e);
      expect(sinCorreo.status).toBe(401);
      expect(malaClave.status).toBe(401);
    });

    it('una cuenta desactivada no entra: con la clave correcta se le dice por qué; con una mala, solo 401', async () => {
      const { usuarios, auth } = crearServicios();
      usuarios.alternarActivo(3, 1);
      const conClave = await firstValueFrom(auth.login({ correo: 'consultor@sivcr.go.cr', contrasena: 'Consulta123' })).catch((e) => e);
      const sinClave = await firstValueFrom(auth.login({ correo: 'consultor@sivcr.go.cr', contrasena: 'Mala12345' })).catch((e) => e);
      expect(conClave.status).toBe(403);
      expect(sinClave.status).toBe(401);
      expect(auth.estaAutenticado()).toBe(false);
    });
  });

  describe('sincronizarSesion', () => {
    it('si la cuenta de la sesión se desactiva, la sesión se cierra', async () => {
      const { usuarios, auth } = crearServicios();
      await firstValueFrom(auth.login({ correo: 'consultor@sivcr.go.cr', contrasena: 'Consulta123' }));
      usuarios.alternarActivo(3, 1);
      expect(auth.sincronizarSesion()).toBe(false);
      expect(auth.estaAutenticado()).toBe(false);
      expect(localStorage.getItem('sivcr_session')).toBeNull();
    });

    it('si cambia el nombre, el correo o el rol de la cuenta, la sesión lo refleja', async () => {
      const { usuarios, auth } = crearServicios();
      await firstValueFrom(auth.login({ correo: 'consultor@sivcr.go.cr', contrasena: 'Consulta123' }));
      await usuarios.actualizar(3, datos({ nombre: 'Carla Nueva', correo: 'consultor@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: '' }), 1);
      expect(auth.sincronizarSesion()).toBe(true);
      expect(auth.usuario()).toMatchObject({ nombre: 'Carla Nueva', rol: 'ANALISTA_TRANSITO' });
    });

    it('al arrancar, una sesión de una cuenta eliminada o con rol alterado a mano no se respeta', async () => {
      crearServicios();
      localStorage.setItem('sivcr_session', JSON.stringify({ token: 'x', usuario: { id: 3, nombre: 'Carla Consultora', correo: 'consultor@sivcr.go.cr', rol: 'ADMIN' } }));
      TestBed.resetTestingModule();
      const { auth } = crearServicios();
      expect(auth.usuario()?.rol).toBe('CONSULTOR_PUBLICO'); // el rol sale del almacén, no de lo que diga la sesión

      localStorage.setItem('sivcr_session', JSON.stringify({ token: 'x', usuario: { id: 77, nombre: 'Fantasma', correo: 'f@x.cr', rol: 'ADMIN' } }));
      TestBed.resetTestingModule();
      expect(crearServicios().auth.estaAutenticado()).toBe(false);
    });
  });
});
