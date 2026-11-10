import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { ROLES_ANALISIS, ROLES_DASHBOARD, SOLO_ADMIN, rutaInicial } from '../config/roles.config';
import { RolUsuario } from '../models/auth.models';
import { AuthService } from '../services/auth.service';
import { authGuard, guestGuard, roleGuard } from './auth.guard';

describe('Rutas por rol', () => {
  let auth: AuthService;
  const ejecutar = (guard: ReturnType<typeof roleGuard> | typeof authGuard | typeof guestGuard, url = '/usuarios') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as boolean | UrlTree;
  const comoUrl = (r: boolean | UrlTree) => (r instanceof UrlTree ? r.toString() : r);
  /** Simula una sesión abierta sin pasar por el servidor */
  const conSesion = (rol: RolUsuario) =>
    localStorage.setItem('sivcr_session', JSON.stringify({ token: 't', usuario: { id: 1, nombre: 'X', correo: 'x@sivcr.go.cr', rol } }));
  const arrancar = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
    auth = TestBed.inject(AuthService);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('rutaInicial', () => {
    it('el administrador y el analista empiezan en el dashboard; el consultor público, en la vista pública', () => {
      expect(rutaInicial('ADMIN')).toBe('/dashboard');
      expect(rutaInicial('ANALISTA_TRANSITO')).toBe('/dashboard');
      expect(rutaInicial('CONSULTOR_PUBLICO')).toBe('/publico');
      expect(rutaInicial(undefined)).toBe('/publico');
    });

    it('con el servidor conectado el dashboard es de los roles de análisis (el servidor niega /dashboard al consultor)', () => {
      expect([...ROLES_DASHBOARD].sort()).toEqual([...ROLES_ANALISIS].sort());
      expect(ROLES_DASHBOARD).not.toContain('CONSULTOR_PUBLICO');
    });
  });

  describe('authGuard', () => {
    it('sin sesión manda al login y recuerda a dónde iba', () => {
      arrancar();
      expect(comoUrl(ejecutar(authGuard, '/usuarios'))).toBe('/login?returnUrl=%2Fusuarios');
    });

    it('con sesión deja pasar', () => {
      conSesion('ADMIN');
      arrancar();
      expect(ejecutar(authGuard)).toBe(true);
    });
  });

  describe('guestGuard (el login)', () => {
    it('sin sesión deja ver el login', () => {
      arrancar();
      expect(ejecutar(guestGuard, '/login')).toBe(true);
    });

    it('con sesión lleva a la pantalla inicial de cada rol', () => {
      conSesion('ANALISTA_TRANSITO');
      arrancar();
      expect(comoUrl(ejecutar(guestGuard, '/login'))).toBe('/dashboard');

      conSesion('CONSULTOR_PUBLICO');
      arrancar();
      expect(comoUrl(ejecutar(guestGuard, '/login'))).toBe('/publico');
    });
  });

  describe('roleGuard', () => {
    it('deja pasar al rol permitido', () => {
      conSesion('ADMIN');
      arrancar();
      expect(ejecutar(roleGuard(SOLO_ADMIN))).toBe(true);
    });

    it('un rol sin acceso vuelve a su pantalla inicial: analista al dashboard, consultor a la vista pública', () => {
      conSesion('ANALISTA_TRANSITO');
      arrancar();
      expect(comoUrl(ejecutar(roleGuard(SOLO_ADMIN)))).toBe('/dashboard');

      conSesion('CONSULTOR_PUBLICO');
      arrancar();
      expect(comoUrl(ejecutar(roleGuard(ROLES_DASHBOARD)))).toBe('/publico');
    });
  });
});
