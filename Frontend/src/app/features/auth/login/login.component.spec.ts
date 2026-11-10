import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { API_CONFIG } from '../../../core/config/api.config';
import { RolUsuario } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent (login de Figma)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<LoginComponent>;
  let navegar: ReturnType<typeof vi.spyOn>;
  const html = () => fixture.nativeElement as HTMLElement;
  const escribir = (id: string, valor: string) => {
    const input = html().querySelector<HTMLInputElement>('#' + id)!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  };
  const enviar = () => {
    html().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const respuesta = (rol: RolUsuario) => ({ token: 't-1', usuario: { id: 1, nombre: 'Ana', correo: 'ana@sivcr.go.cr', rol } });
  const crear = async (returnUrl: string | null = null) => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  };

  const useMockOriginal = API_CONFIG.useMock;
  beforeEach(() => {
    API_CONFIG.useMock = false;
    localStorage.clear();
  });
  afterEach(() => {
    http.verify();
    API_CONFIG.useMock = useMockOriginal;
    localStorage.clear();
  });

  it('muestra lo del Figma: «Panel de indicadores», «Iniciar Sesión», los dos campos y los dos botones', async () => {
    await crear();
    expect(html().querySelector('.titulo-app')?.textContent).toContain('Panel de indicadores');
    expect(html().querySelector('h1')?.textContent?.trim()).toBe('Iniciar Sesión');
    expect(html().querySelector('label[for="correo"]')?.textContent).toContain('Correo electrónico');
    expect(html().querySelector<HTMLInputElement>('#correo')?.placeholder).toBe('example@email.com');
    expect(html().querySelector('label[for="contrasena"]')?.textContent).toContain('Contraseña');
    const botones = Array.from(html().querySelectorAll('.botones .btn')).map((b) => b.textContent?.trim());
    expect(botones).toEqual(['Ingresar', 'Ingresar sin Credenciales']);
  });

  it('«Ingresar sin Credenciales» lleva a la vista pública, que no necesita sesión', async () => {
    await crear();
    const enlace = Array.from(html().querySelectorAll<HTMLAnchorElement>('a.btn')).find((a) => a.textContent?.includes('sin Credenciales'))!;
    expect(enlace.getAttribute('href')).toBe('/publico');
  });

  it('con el servidor real no muestra las cuentas de prueba del navegador', async () => {
    await crear();
    expect(html().querySelector('.demo-box')).toBeNull();
    expect(html().textContent).not.toContain('Admin123');
  });

  it('con los campos vacíos avisa junto a cada uno y no llama al servidor', async () => {
    await crear();
    enviar();
    expect(html().textContent).toContain('El correo es obligatorio.');
    expect(html().textContent).toContain('La contraseña es obligatoria.');
    expect(html().querySelector('#correo')?.getAttribute('aria-invalid')).toBe('true');
    http.expectNone(`${API_CONFIG.baseUrl}/auth/login`);
  });

  it('un correo mal escrito se avisa sin viajar al servidor', async () => {
    await crear();
    escribir('correo', 'no-es-un-correo');
    escribir('contrasena', 'Clave1234');
    enviar();
    expect(html().textContent).toContain('Ingrese un correo válido.');
    http.expectNone(`${API_CONFIG.baseUrl}/auth/login`);
  });

  it('«Ingresar» manda correo y contraseña a POST /auth/login y abre la sesión', async () => {
    await crear();
    escribir('correo', 'ana@sivcr.go.cr');
    escribir('contrasena', 'Clave1234');
    enviar();
    const r = http.expectOne(`${API_CONFIG.baseUrl}/auth/login`);
    expect(r.request.body).toEqual({ correo: 'ana@sivcr.go.cr', contrasena: 'Clave1234' });
    expect(html().querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true); // evita doble envío
    r.flush(respuesta('ADMIN'));
    expect(TestBed.inject(AuthService).estaAutenticado()).toBe(true);
  });

  it.each([
    ['ADMIN', '/dashboard'],
    ['ANALISTA_TRANSITO', '/dashboard'],
    ['CONSULTOR_PUBLICO', '/publico'],
  ] as const)('después de ingresar, el rol %s llega a %s', async (rol, destino) => {
    await crear();
    escribir('correo', 'ana@sivcr.go.cr');
    escribir('contrasena', 'Clave1234');
    enviar();
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush(respuesta(rol));
    expect(navegar).toHaveBeenCalledWith(destino);
  });

  it('si venía de una pantalla propia, vuelve a ella', async () => {
    await crear('/registros');
    escribir('correo', 'ana@sivcr.go.cr');
    escribir('contrasena', 'Clave1234');
    enviar();
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush(respuesta('ADMIN'));
    expect(navegar).toHaveBeenCalledWith('/registros');
  });

  it('un returnUrl hacia otro sitio se ignora (no es una redirección abierta)', async () => {
    await crear('//sitio-malo.example/entrar');
    escribir('correo', 'ana@sivcr.go.cr');
    escribir('contrasena', 'Clave1234');
    enviar();
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush(respuesta('ADMIN'));
    expect(navegar).toHaveBeenCalledWith('/dashboard');
  });

  it('con credenciales incorrectas muestra un mensaje que no revela si el correo existe, y deja reintentar', async () => {
    await crear();
    escribir('correo', 'ana@sivcr.go.cr');
    escribir('contrasena', 'mala');
    enviar();
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).flush({ mensaje: 'Correo o contraseña incorrectos.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(html().querySelector('.alert')?.textContent).toContain('Correo o contraseña incorrectos.');
    expect(html().querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sin conexión con el servidor lo dice con claridad', async () => {
    await crear();
    escribir('correo', 'ana@sivcr.go.cr');
    escribir('contrasena', 'Clave1234');
    enviar();
    http.expectOne(`${API_CONFIG.baseUrl}/auth/login`).error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();
    expect(html().querySelector('.alert')?.textContent).toContain('No hay conexión con el servidor');
  });

  it('el botón «Ver» muestra y oculta la contraseña', async () => {
    await crear();
    const clave = html().querySelector<HTMLInputElement>('#contrasena')!;
    const boton = html().querySelector<HTMLButtonElement>('.toggle')!;
    expect(clave.type).toBe('password');
    boton.click();
    fixture.detectChanges();
    expect(clave.type).toBe('text');
    expect(boton.getAttribute('aria-pressed')).toBe('true');
  });
});
