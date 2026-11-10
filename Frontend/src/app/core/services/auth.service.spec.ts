import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { LoginResponse, RolUsuario } from '../models/auth.models';
import { AuthService } from './auth.service';

const sesion = (rol: RolUsuario = 'ADMIN', id = 1): LoginResponse => ({
  token: 'token-de-prueba-' + id,
  usuario: { id, nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol },
});

describe('AuthService con el servidor real (useMock = false)', () => {
  const useMockOriginal = API_CONFIG.useMock;
  let http: HttpTestingController;
  let auth: AuthService;
  const login = async (s = sesion()) => {
    const promesa = firstValueFrom(auth.login({ correo: s.usuario.correo, contrasena: 'Clave1234' }));
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush(s);
    await promesa;
  };

  beforeEach(() => {
    API_CONFIG.useMock = false;
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => {
    http.verify();
    API_CONFIG.useMock = useMockOriginal;
    localStorage.clear();
  });

  it('el login hace POST /auth/login con correo y contraseña y guarda el token y el usuario que devuelve el servidor', async () => {
    const promesa = firstValueFrom(auth.login({ correo: 'ana@sivcr.go.cr', contrasena: 'Clave1234' }));
    const r = http.expectOne(`${API_CONFIG.baseUrl}/auth/login`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ correo: 'ana@sivcr.go.cr', contrasena: 'Clave1234' });
    r.flush(sesion('ANALISTA_TRANSITO', 2));
    await promesa;

    expect(auth.estaAutenticado()).toBe(true);
    expect(auth.token()).toBe('token-de-prueba-2');
    expect(auth.usuario()?.rol).toBe('ANALISTA_TRANSITO');
    expect(auth.tieneRol(['ANALISTA_TRANSITO'])).toBe(true);
    expect(auth.tieneRol(['ADMIN'])).toBe(false);
  });

  it('nunca guarda la contraseña: solo el token y el usuario', async () => {
    await login();
    const guardado = localStorage.getItem('sivcr_session') ?? '';
    expect(guardado).toContain('token-de-prueba-1');
    expect(guardado).not.toContain('Clave1234');
  });

  it('un login rechazado no abre sesión', async () => {
    const promesa = firstValueFrom(auth.login({ correo: 'ana@sivcr.go.cr', contrasena: 'mala' })).catch((e) => e);
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush({ mensaje: 'Correo o contraseña incorrectos.' }, { status: 401, statusText: 'Unauthorized' });
    expect((await promesa).status).toBe(401);
    expect(auth.estaAutenticado()).toBe(false);
    expect(localStorage.getItem('sivcr_session')).toBeNull();
  });

  it('cerrar sesión avisa al servidor (POST /auth/logout) para invalidar el token y limpia la sesión local', async () => {
    await login();
    auth.logout();
    const r = http.expectOne(`${API_CONFIG.baseUrl}/auth/logout`);
    expect(r.request.method).toBe('POST');
    r.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.estaAutenticado()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('sivcr_session')).toBeNull();
  });

  it('si el aviso al servidor falla, igual se sale', async () => {
    await login();
    auth.logout();
    http.expectOne(`${API_CONFIG.baseUrl}/auth/logout`).error(new ProgressEvent('error'), { status: 0 });
    expect(auth.estaAutenticado()).toBe(false);
  });

  it('cuando el cierre lo provoca el servidor (401), no se le avisa de nuevo', async () => {
    await login();
    auth.logout(false);
    http.expectNone(`${API_CONFIG.baseUrl}/auth/logout`);
    expect(auth.estaAutenticado()).toBe(false);
  });

  it('sin sesión, cerrar sesión no llama al servidor', () => {
    auth.logout();
    http.expectNone(`${API_CONFIG.baseUrl}/auth/logout`);
  });

  it('al editar la propia cuenta, la sesión muestra el nombre y el correo nuevos (y conserva token y rol)', async () => {
    await login();
    auth.actualizarIdentidad({ id: 1, nombre: 'Ana Gómez', correo: 'ana.gomez@sivcr.go.cr', rol: 'ADMIN' });
    expect(auth.usuario()?.nombre).toBe('Ana Gómez');
    expect(auth.usuario()?.correo).toBe('ana.gomez@sivcr.go.cr');
    expect(auth.token()).toBe('token-de-prueba-1');
    expect(JSON.parse(localStorage.getItem('sivcr_session')!).usuario.nombre).toBe('Ana Gómez');
  });

  it('editar la cuenta de otra persona no toca la sesión', async () => {
    await login();
    auth.actualizarIdentidad({ id: 7, nombre: 'Otra Persona', correo: 'otra@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO' });
    expect(auth.usuario()?.nombre).toBe('Ana Admin');
  });

  it('una sesión guardada de antes se recupera al arrancar', () => {
    localStorage.setItem('sivcr_session', JSON.stringify(sesion('CONSULTOR_PUBLICO', 3)));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const otro = TestBed.inject(AuthService);
    expect(otro.usuario()?.rol).toBe('CONSULTOR_PUBLICO');
    expect(otro.token()).toBe('token-de-prueba-3');
  });
});
