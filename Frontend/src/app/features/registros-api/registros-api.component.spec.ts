import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FiltrosApiService } from '../../core/api/filtros-api.service';
import { filtrosApiVacios } from '../../core/api/filtros-api';
import { PaginaApi, SiniestroApi } from '../../core/api/modelos-api';
import { imitarDialogoNativo } from '../../shared/testing/dialogo-jsdom';
import { RegistrosApiComponent } from './registros-api.component';

const fila = (cambios: Partial<SiniestroApi> = {}): SiniestroApi => ({
  provincia: 'HEREDIA', canton: 'Santo Domingo', distrito: 'San Miguel', ruta: '32', km: 7, lat: null, lon: null,
  tipoVehiculo: null, severidad: 'SOLO_HERIDOS_LEVES', clima: 'LLUVIA', calzada: 'BUENA', tiempoRespuestaMins: null,
  calidad: 'VALIDO', fecha: null, anio: 2024, mes: 7, diaSemana: 'MARTES', franja: 'NOCHE', victima: null, ...cambios,
});

const pagina = (items: SiniestroApi[], total = items.length, pag = 0, tamano = 25): PaginaApi<SiniestroApi> => ({
  items, total, pagina: pag, tamano, totalPaginas: Math.max(1, Math.ceil(total / tamano)),
});

describe('RegistrosApiComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<RegistrosApiComponent>;

  const busqueda = (): TestRequest => http.expectOne((r) => r.url.endsWith('/records/search'));
  const html = (): HTMLElement => fixture.nativeElement as HTMLElement;
  /** Deja pasar las promesas pendientes (las peticiones se esperan con firstValueFrom) y refresca la vista */
  const estable = async () => { await fixture.whenStable(); await new Promise((r) => setTimeout(r)); fixture.detectChanges(); };

  beforeEach(async () => {
    imitarDialogoNativo();
    await TestBed.configureTestingModule({
      imports: [RegistrosApiComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(FiltrosApiService).limpiar();
    fixture = TestBed.createComponent(RegistrosApiComponent);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('al abrirse pide la primera página (page=0) sin filtros y muestra las filas del servidor', async () => {
    const r = busqueda();
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.body).toEqual({});
    r.flush(pagina([fila(), fila({ provincia: 'LIMON', canton: 'Pococí' })], 2));
    await estable();
    const filas = html().querySelectorAll('tbody tr');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Heredia');
    expect(filas[0].textContent).toContain('Solo heridos leves');
    expect(filas[1].textContent).toContain('Limón');
    expect(html().textContent).toContain('Mostrando 1–2 de 2 siniestros');
  });

  it('muestra "—" donde la fuente no trae el dato', async () => {
    busqueda().flush(pagina([fila({ km: null, ruta: null })]));
    await estable();
    const celdas = Array.from(html().querySelectorAll('tbody tr:first-child td')).map((td) => td.textContent?.trim());
    expect(celdas.filter((t) => t === '—')).toHaveLength(2);
  });

  it('cuando no hay registros avisa que falta cargar datos (sin filtros activos)', async () => {
    busqueda().flush(pagina([], 0));
    await estable();
    expect(html().textContent).toContain('Todavía no hay siniestros cargados');
    expect(html().querySelector('a[href="/ingesta"]')).not.toBeNull();
  });

  it('si el servidor no responde, muestra el motivo y permite reintentar', async () => {
    busqueda().error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await estable();
    expect(html().querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar con el servidor');
    (html().querySelector('.error-carga button') as HTMLButtonElement).click();
    const otra = busqueda();
    otra.flush(pagina([fila()]));
    await estable();
    expect(html().querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('aplicar filtros manda solo los criterios con valor y vuelve a la página 1', async () => {
    busqueda().flush(pagina([fila()]));
    await estable();

    const selectProvincia = html().querySelectorAll('.cuerpo-filtros select')[0] as HTMLSelectElement;
    selectProvincia.value = 'HEREDIA';
    selectProvincia.dispatchEvent(new Event('change'));
    const anio = html().querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    anio.value = '2024';
    anio.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(html().textContent).toContain('Hay cambios sin aplicar');

    (html().querySelector('.aplicar') as HTMLButtonElement).click();
    const r = busqueda();
    expect(r.request.body).toEqual({ provincia: 'HEREDIA', anio: 2024 });
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pagina([fila()], 1));
    await estable();
    expect(html().querySelector('.chips-aplicados')?.textContent).toContain('Provincia: Heredia');
    expect(html().querySelector('.chips-aplicados')?.textContent).toContain('Año: 2024');
  });

  it('un año fuera de rango se avisa sin molestar al servidor', async () => {
    busqueda().flush(pagina([fila()]));
    await estable();
    const anio = html().querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    anio.value = '1800';
    anio.dispatchEvent(new Event('input'));
    (html().querySelector('.aplicar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(html().querySelector('.error-filtros')?.textContent).toContain('entre 1900 y 2100');
    http.expectNone((r) => r.url.endsWith('/records/search'));
  });

  it('cambiar de página pide esa página al servidor (page empieza en 0)', async () => {
    busqueda().flush(pagina([fila()], 120, 0, 25));
    await estable();
    (html().querySelector('button[aria-label="Página 2"]') as HTMLButtonElement).click();
    const r = busqueda();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pagina([fila()], 120, 1, 25));
  });

  it('ordenar por una columna manda sort al servidor; las columnas sin orden no son botones', async () => {
    busqueda().flush(pagina([fila()]));
    await estable();
    const encabezados = Array.from(html().querySelectorAll('thead th'));
    const dia = encabezados.find((th) => th.textContent?.includes('Día'))!;
    expect(dia.querySelector('button')).toBeNull();
    (encabezados.find((th) => th.textContent?.includes('Cantón'))!.querySelector('button') as HTMLButtonElement).click();
    const r = busqueda();
    expect(r.request.params.get('sort')).toBe('canton');
    r.flush(pagina([fila()]));
  });

  it('si los datos cambiaron y la página ya no existe, pasa a la última en vez de mostrar una tabla vacía', async () => {
    busqueda().flush(pagina([fila()], 120, 0, 25));
    await estable();
    (html().querySelector('button[aria-label="Última página"]') as HTMLButtonElement).click();
    const r = busqueda();
    expect(r.request.params.get('page')).toBe('4');
    r.flush(pagina([], 30, 4, 25)); // ahora solo hay 30 registros → 2 páginas
    await estable(); // el componente reacciona a la respuesta y vuelve a pedir
    const reintento = busqueda();
    expect(reintento.request.params.get('page')).toBe('1');
    reintento.flush(pagina([fila()], 30, 1, 25));
    await estable();
    expect(html().querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('los botones de exportar están desactivados y dicen que falta en el servidor', async () => {
    busqueda().flush(pagina([fila()]));
    await estable();
    const botones = Array.from(html().querySelectorAll('.barra .btn')) as HTMLButtonElement[];
    expect(botones).toHaveLength(3);
    expect(botones.every((b) => b.disabled)).toBe(true);
    expect(html().querySelector('.pill-pendiente')?.textContent).toContain('Pendiente');
  });

  it('guardar consulta está desactivado sin filtros y, con filtros, manda el nombre y los criterios', async () => {
    TestBed.inject(FiltrosApiService).reemplazar({ ...filtrosApiVacios(), provincia: 'CARTAGO' });
    fixture = TestBed.createComponent(RegistrosApiComponent);
    fixture.detectChanges();
    http.match((r) => r.url.endsWith('/records/search')).forEach((r) => r.flush(pagina([fila()])));
    await estable();

    (html().querySelector('.guardar') as HTMLButtonElement).click();
    fixture.detectChanges();
    const entrada = document.querySelector('dialog input[type="text"]') as HTMLInputElement;
    entrada.value = 'Cartago';
    entrada.dispatchEvent(new Event('input'));
    (document.querySelector('dialog .principal') as HTMLButtonElement).click();
    const guardar = http.expectOne((r) => r.url.endsWith('/queries/saved'));
    expect(guardar.request.body).toEqual({ nombre: 'Cartago', criterios: { provincia: 'CARTAGO' } });
    guardar.flush({ id: 1, nombre: 'Cartago', criterios: { provincia: 'CARTAGO' }, creadoEn: '2026-11-09T10:00:00' }, { status: 201, statusText: 'Created' });
  });
});
