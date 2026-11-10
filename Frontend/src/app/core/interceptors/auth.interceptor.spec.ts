import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  const useMockOriginal = API_CONFIG.useMock;
  let http: HttpTestingController;
  let cliente: HttpClient;
  let auth: AuthService;
  let navegar: ReturnType<typeof vi.spyOn>;

  const iniciarSesion = async () => {
    const promesa = firstValueFrom(auth.login({ correo: 'ana@sivcr.go.cr', contrasena: 'Clave1234' }));
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush({
      token: 'tok-123', usuario: { id: 1, nombre: 'Ana', correo: 'ana@sivcr.go.cr', rol: 'ADMIN' },
    });
    await promesa;
  };

  beforeEach(() => {
    API_CONFIG.useMock = false;
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    cliente = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => {
    http.verify();
    API_CONFIG.useMock = useMockOriginal;
    localStorage.clear();
  });

  it('con sesión, cada petición lleva «Authorization: Bearer <token>»', async () => {
    await iniciarSesion();
    cliente.get(`${API_CONFIG.baseUrl}/records`).subscribe();
    expect(http.expectOne(`${API_CONFIG.baseUrl}/records`).request.headers.get('Authorization')).toBe('Bearer tok-123');
  });

  it('sin sesión no manda la cabecera (la vista pública no la necesita)', () => {
    cliente.get(`${API_CONFIG.baseUrl}/public/summary`).subscribe();
    expect(http.expectOne(`${API_CONFIG.baseUrl}/public/summary`).request.headers.has('Authorization')).toBe(false);
  });

  it('un 401 con token (sesión vencida) cierra la sesión sin avisar al servidor y lleva al login', async () => {
    await iniciarSesion();
    cliente.get(`${API_CONFIG.baseUrl}/records`).subscribe({ error: () => undefined });
    http.expectOne(`${API_CONFIG.baseUrl}/records`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.estaAutenticado()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login']);
    http.expectNone(`${API_CONFIG.baseUrl}/auth/logout`);
  });

  it('un 401 sin token no es una sesión vencida: no navega al login (quien mira la vista pública sigue ahí)', () => {
    cliente.get(`${API_CONFIG.baseUrl}/public/summary`).subscribe({ error: () => undefined });
    http.expectOne(`${API_CONFIG.baseUrl}/public/summary`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(navegar).not.toHaveBeenCalled();
  });

  it('un 401 del propio login (contraseña mala) no se toma por sesión vencida', async () => {
    const promesa = firstValueFrom(auth.login({ correo: 'ana@sivcr.go.cr', contrasena: 'mala' })).catch(() => undefined);
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await promesa;
    expect(navegar).not.toHaveBeenCalled();
  });

  it('un 403 (rol sin permiso) no cierra la sesión', async () => {
    await iniciarSesion();
    cliente.get(`${API_CONFIG.baseUrl}/users`).subscribe({ error: () => undefined });
    http.expectOne(`${API_CONFIG.baseUrl}/users`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.estaAutenticado()).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
  });
});
