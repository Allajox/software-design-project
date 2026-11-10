import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API_CONFIG } from '../../core/config/api.config';
import { RolUsuario } from '../../core/models/auth.models';
import { PublicoComponent } from './publico.component';

const resumen = {
  totalSiniestros: 93699,
  porAnio: [{ etiqueta: '2023', valor: 30000, porcentaje: 32 }],
  porProvincia: [{ etiqueta: 'San José', valor: 40000, porcentaje: 42.7 }],
  porSeveridad: [{ etiqueta: 'Solo heridos leves', valor: 90000, porcentaje: 96 }],
  porFranja: [{ etiqueta: 'Tarde', valor: 35000, porcentaje: 37.4 }],
};

describe('PublicoComponent (Ingresar sin Credenciales)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PublicoComponent>;
  const html = () => fixture.nativeElement as HTMLElement;
  const abrir = async (rol: RolUsuario | null) => {
    if (rol) {
      localStorage.setItem('sivcr_session', JSON.stringify({ token: 't', usuario: { id: 5, nombre: 'Carla Consultora', correo: 'carla@sivcr.go.cr', rol } }));
    }
    await TestBed.configureTestingModule({
      imports: [PublicoComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PublicoComponent);
    fixture.detectChanges();
    http.expectOne(`${API_CONFIG.baseUrl}/public/summary`).flush(resumen);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('sin sesión muestra las cifras nacionales y el enlace para ingresar al sistema', async () => {
    await abrir(null);
    expect(html().textContent).toContain('93');
    expect(html().textContent).toContain('siniestros registrados');
    expect(html().querySelector('.acceso a')?.getAttribute('href')).toBe('/login');
    expect(html().textContent).not.toContain('Cerrar sesión');
  });

  it('el consultor público ve su nombre y puede cerrar sesión, pero no tiene panel al que volver', async () => {
    await abrir('CONSULTOR_PUBLICO');
    expect(html().querySelector('.acceso')?.textContent).toContain('Sesión de Carla Consultora');
    expect(html().querySelector('.acceso a[href="/dashboard"]')).toBeNull();
    expect(html().textContent).not.toContain('Ingresar al sistema');
  });

  it('quien tiene dashboard (analista) puede volver a él desde la vista pública', async () => {
    await abrir('ANALISTA_TRANSITO');
    expect(html().querySelector('.acceso a[href="/dashboard"]')?.textContent).toContain('Ir al panel de indicadores');
  });

  it('«Cerrar sesión» cierra la sesión (también en el servidor) y lleva al login', async () => {
    await abrir('CONSULTOR_PUBLICO');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    html().querySelector<HTMLButtonElement>('.acceso button')!.click();
    expect(http.expectOne(`${API_CONFIG.baseUrl}/auth/logout`).request.method).toBe('POST');
    expect(localStorage.getItem('sivcr_session')).toBeNull();
    expect(navegar).toHaveBeenCalledWith(['/login']);
  });
});
