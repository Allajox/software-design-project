import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FiltrosApiService } from '../../core/api/filtros-api.service';
import { ConsultaGuardadaApi, ConsultaHistorialApi } from '../../core/api/modelos-api';
import { imitarDialogoNativo } from '../../shared/testing/dialogo-jsdom';
import { HistorialApiComponent } from './historial-api.component';

const guardada: ConsultaGuardadaApi = {
  id: 1, nombre: 'Heredia de noche', creadoEn: '2026-11-09T10:00:00',
  criterios: { provincia: 'HEREDIA', anio: 0, mes: 0, franja: 'NOCHE', edadMin: 0, edadMax: 0 }, // el servidor manda 0 sin filtro
};
const reciente: ConsultaHistorialApi = {
  id: 9, fecha: '2026-11-09T11:30:00', resumen: 'Cartago, 2023',
  criterios: { provincia: 'CARTAGO', anio: 2023, mes: null, genero: 'FEMENINO' },
};

describe('HistorialApiComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HistorialApiComponent>;
  const html = () => fixture.nativeElement as HTMLElement;
  /** Deja pasar las promesas pendientes (las peticiones se esperan con firstValueFrom) y refresca la vista */
  const estable = async () => { await fixture.whenStable(); await new Promise((r) => setTimeout(r)); fixture.detectChanges(); };
  const cargarListas = async (g: ConsultaGuardadaApi[], r: ConsultaHistorialApi[]) => {
    http.expectOne((x) => x.url.endsWith('/queries/saved')).flush(g);
    http.expectOne((x) => x.url.endsWith('/queries/history')).flush(r);
    await estable();
  };

  beforeEach(async () => {
    imitarDialogoNativo();
    await TestBed.configureTestingModule({
      imports: [HistorialApiComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(FiltrosApiService).limpiar();
    fixture = TestBed.createComponent(HistorialApiComponent);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('lista las consultas guardadas y las recientes del servidor con sus filtros en frases', async () => {
    await cargarListas([guardada], [reciente]);
    const bloques = html().querySelectorAll('section.bloque');
    expect(bloques).toHaveLength(2);
    expect(bloques[0].textContent).toContain('Heredia de noche');
    expect(bloques[0].textContent).toContain('Provincia: Heredia');
    expect(bloques[0].textContent).toContain('Franja: Noche');
    expect(bloques[1].textContent).toContain('Provincia: Cartago');
    expect(bloques[1].textContent).toContain('Año: 2023');
  });

  it('los 0 que manda el servidor no aparecen como filtros ("Año: 0")', async () => {
    await cargarListas([guardada], []);
    expect(html().textContent).not.toContain('Año: 0');
    expect(html().textContent).not.toContain('Mes: 0');
  });

  it('avisa que renombrar, eliminar y limpiar están pendientes en el servidor y no los simula', async () => {
    await cargarListas([guardada], [reciente]);
    expect(html().textContent).toContain('Renombrar y eliminar: pendiente');
    expect(html().textContent).toContain('Limpiar historial: pendiente');
    const textos = Array.from(html().querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
    expect(textos.some((t) => /Eliminar|Renombrar|Quitar|Limpiar/.test(t))).toBe(false);
  });

  it('marca las consultas con criterios de víctimas que no se aplican a siniestros', async () => {
    await cargarListas([], [reciente]);
    expect(html().querySelector('.chips li.advertencia')?.textContent).toContain('no se aplican a siniestros');
  });

  it('aplicar una consulta deja sus filtros en el explorador (sin edad ni género) y navega a /registros', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await cargarListas([], [reciente]);
    (html().querySelector('.acciones .primario') as HTMLButtonElement).click();
    const f = TestBed.inject(FiltrosApiService).filtros();
    expect(f.provincia).toBe('CARTAGO');
    expect(f.anio).toBe(2023);
    expect(navegar).toHaveBeenCalledWith('/registros');
  });

  it('guardar una reciente con nombre manda sus criterios y recarga las guardadas', async () => {
    await cargarListas([], [reciente]);
    const guardar = Array.from(html().querySelectorAll('.acciones button')).find((b) => b.textContent?.includes('Guardar con nombre')) as HTMLButtonElement;
    guardar.click();
    fixture.detectChanges();
    const entrada = document.querySelector('dialog input[type="text"]') as HTMLInputElement;
    entrada.value = 'Cartago 2023';
    entrada.dispatchEvent(new Event('input'));
    (document.querySelector('dialog .principal') as HTMLButtonElement).click();
    const post = http.expectOne((x) => x.url.endsWith('/queries/saved') && x.method === 'POST');
    expect(post.request.body.nombre).toBe('Cartago 2023');
    expect(post.request.body.criterios.provincia).toBe('CARTAGO');
    post.flush({ ...guardada, id: 2, nombre: 'Cartago 2023' }, { status: 201, statusText: 'Created' });
    await estable();
    http.expectOne((x) => x.url.endsWith('/queries/saved') && x.method === 'GET').flush([{ ...guardada, id: 2, nombre: 'Cartago 2023' }]);
    await estable();
    expect(html().querySelector('section.bloque')?.textContent).toContain('Cartago 2023');
  });

  it('si el nombre ya existe, el servidor lo rechaza (409) y el motivo se ve en el cuadro sin cerrarlo', async () => {
    await cargarListas([], [reciente]);
    const guardar = Array.from(html().querySelectorAll('.acciones button')).find((b) => b.textContent?.includes('Guardar con nombre')) as HTMLButtonElement;
    guardar.click();
    fixture.detectChanges();
    const entrada = document.querySelector('dialog input[type="text"]') as HTMLInputElement;
    entrada.value = 'Repetido';
    entrada.dispatchEvent(new Event('input'));
    (document.querySelector('dialog .principal') as HTMLButtonElement).click();
    http.expectOne((x) => x.method === 'POST').flush({ mensaje: 'Ya tienes un filtro guardado con el nombre "Repetido".' }, { status: 409, statusText: 'Conflict' });
    await estable();
    expect(document.querySelector('dialog .error')?.textContent).toContain('Ya tienes un filtro guardado');
  });

  it('si el servidor falla, muestra el motivo y permite reintentar', async () => {
    http.expectOne((x) => x.url.endsWith('/queries/saved')).error(new ProgressEvent('error'), { status: 0, statusText: 'x' });
    http.expectOne((x) => x.url.endsWith('/queries/history')).error(new ProgressEvent('error'), { status: 0, statusText: 'x' });
    await estable();
    expect(html().querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con el servidor');
    (html().querySelector('.reintentar') as HTMLButtonElement).click();
    await cargarListas([], []);
    expect(html().textContent).toContain('Aún no hay consultas guardadas');
  });
});
