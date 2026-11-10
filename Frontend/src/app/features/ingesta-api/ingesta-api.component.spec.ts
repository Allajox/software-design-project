import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CargaApi } from '../../core/api/modelos-api';
import { IngestaApiComponent } from './ingesta-api.component';

const carga = (cambios: Partial<CargaApi> = {}): CargaApi => ({
  id: 5, fecha: '2026-11-09T10:00:00', fuente: 'COSEVI', resultado: 'PARCIAL', usuarioId: 1, usuario: 'Ana',
  archivo: 'cosevi.csv', perfil: 'cosevi-siniestros', mensaje: 'Carga parcial: 31 válidos, 0 incompletos y 2 corruptos.',
  checksum: 'abc', resumen: { validos: 31, incompletos: 0, corruptos: 2, omitidos: 0 }, ...cambios,
});

describe('IngestaApiComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<IngestaApiComponent>;
  const html = () => fixture.nativeElement as HTMLElement;
  /** Deja pasar las promesas pendientes (las peticiones se esperan con firstValueFrom) y refresca la vista */
  const estable = async () => { await fixture.whenStable(); await new Promise((r) => setTimeout(r)); fixture.detectChanges(); };

  const elegirArchivo = (nombre: string, contenido = 'a;b\r\n1;2') => {
    const entrada = html().querySelector('input[type="file"]') as HTMLInputElement;
    const archivo = new File([contenido], nombre);
    Object.defineProperty(entrada, 'files', { value: [archivo], configurable: true });
    entrada.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const botonSubir = () => html().querySelector('.subir button') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestaApiComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(IngestaApiComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/ingestion/history')).flush([]);
    await estable();
  });
  afterEach(() => http.verify());

  it('ofrece COSEVI e INEC y deja MOPT e IMN desactivados con su motivo', () => {
    const radios = Array.from(html().querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    expect(radios.map((r) => [r.value, r.disabled])).toEqual([['COSEVI', false], ['INEC', false], ['MOPT', true], ['IMN', true]]);
    expect(html().textContent).toContain('Pendiente: aún no hay dónde guardar la red vial');
  });

  it('"Subir y procesar" está desactivado hasta elegir un archivo válido', () => {
    expect(botonSubir().disabled).toBe(true);
    elegirArchivo('notas.txt');
    expect(botonSubir().disabled).toBe(true);
    expect(html().querySelector('[role="alert"]')?.textContent).toContain('Formato no soportado');
    elegirArchivo('cosevi.csv');
    expect(botonSubir().disabled).toBe(false);
    expect(html().textContent).toContain('cosevi.csv');
  });

  it('rechaza un archivo vacío sin molestar al servidor', () => {
    elegirArchivo('vacio.csv', '');
    expect(html().querySelector('[role="alert"]')?.textContent).toContain('vacío');
    expect(botonSubir().disabled).toBe(true);
  });

  it('sube el archivo con la fuente elegida, muestra "procesando" y luego el resultado con sus conteos', async () => {
    elegirArchivo('cosevi.csv');
    botonSubir().click();
    const r = http.expectOne((x) => x.url.endsWith('/ingestion/upload'));
    expect((r.request.body as FormData).get('fuente')).toBe('COSEVI');
    expect((r.request.body as FormData).get('file')).toBeInstanceOf(File);
    fixture.detectChanges();
    expect(html().querySelector('.procesando')?.textContent).toContain('procesando');
    expect(html().querySelector('.procesando')?.textContent).toContain('varios minutos');

    r.flush(carga());
    await estable();
    http.expectOne((x) => x.url.endsWith('/ingestion/history')).flush([carga()]); // se refresca el historial
    await estable();
    const resultado = html().querySelector('.resultado')!;
    expect(resultado.classList).toContain('parcial');
    expect(resultado.textContent).toContain('Carga parcial');
    expect(resultado.textContent).toContain('Carga n.º 5');
    const nums = Array.from(resultado.querySelectorAll('.tile .num')).map((n) => n.textContent?.trim());
    expect(nums).toEqual(['31', '0', '2', '0']);
    expect(resultado.textContent).toMatch(/93,9\s?%/); // 31 de 33 válidas
  });

  it('una carga FALLIDA (por ejemplo un duplicado) muestra el motivo del servidor y no ofrece reporte ni "ver registros"', async () => {
    elegirArchivo('cosevi.csv');
    botonSubir().click();
    http.expectOne((x) => x.url.endsWith('/ingestion/upload')).flush(carga({
      id: 6, resultado: 'FALLIDA', perfil: null, mensaje: 'Este archivo ya se cargó en la carga n.º 5; se rechazó para no duplicar registros.',
      resumen: { validos: 0, incompletos: 0, corruptos: 0, omitidos: 0 },
    }));
    await estable();
    http.expectOne((x) => x.url.endsWith('/ingestion/history')).flush([]);
    await estable();
    const resultado = html().querySelector('.resultado')!;
    expect(resultado.classList).toContain('fallida');
    expect(resultado.textContent).toContain('ya se cargó en la carga n.º 5');
    expect(resultado.textContent).not.toContain('Ver reporte de calidad');
    expect(resultado.querySelector('a[href="/registros"]')).toBeNull();
  });

  it('un error de uso del servidor (400) se muestra y deja volver a intentar', async () => {
    elegirArchivo('cosevi.csv');
    botonSubir().click();
    http.expectOne((x) => x.url.endsWith('/ingestion/upload')).flush({ mensaje: 'No se recibió ningún archivo o está vacío.' }, { status: 400, statusText: 'Bad Request' });
    await estable();
    expect(html().querySelector('.alerta.error')?.textContent).toContain('No se recibió ningún archivo');
    expect(html().querySelector('.subir button')).not.toBeNull();
  });

  it('si el usuario no es ADMIN el servidor responde 403 y se explica con claridad', async () => {
    elegirArchivo('cosevi.csv');
    botonSubir().click();
    http.expectOne((x) => x.url.endsWith('/ingestion/upload')).flush(null, { status: 403, statusText: 'Forbidden' });
    await estable();
    expect(html().querySelector('.alerta.error')?.textContent).toContain('Su rol no tiene permiso');
  });

  it('el reporte de calidad lista los errores y avisa cuando el servidor recortó la lista', async () => {
    elegirArchivo('cosevi.csv');
    botonSubir().click();
    http.expectOne((x) => x.url.endsWith('/ingestion/upload')).flush(carga());
    await estable();
    http.expectOne((x) => x.url.endsWith('/ingestion/history')).flush([]);
    await estable();
    (Array.from(html().querySelectorAll('.resultado button')).find((b) => b.textContent?.includes('Ver reporte')) as HTMLButtonElement).click();
    http.expectOne((x) => x.url.endsWith('/ingestion/5/quality-report')).flush({
      idCarga: 5, validos: 31, incompletos: 0, corruptos: 2, omitidos: 0, errores: ['Fila 33: valor no válido en \'Año\' (no es un número).'],
    });
    await estable();
    const rep = html().querySelector('#t-reporte')!.closest('section')!;
    expect(rep.querySelectorAll('.errores li')).toHaveLength(1);
    expect(rep.textContent).toContain('Fila 33');
    expect(rep.textContent).toContain('Se listan los primeros 1 errores');
  });

  it('el historial muestra cada carga con su resultado y conteos; "—" si no llegó a evaluar filas', async () => {
    fixture.componentInstance['historial'].set([
      carga(),
      carga({ id: 4, resultado: 'FALLIDA', resumen: null, archivo: 'x.txt', usuario: null }),
    ]);
    await estable();
    const filas = html().querySelectorAll('table.cargas tbody tr');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Parcial');
    expect(filas[0].textContent).toContain('31');
    expect(filas[1].textContent).toContain('Fallida');
    const celdas = Array.from(filas[1].querySelectorAll('td')).map((t) => t.textContent?.trim());
    expect(celdas.filter((t) => t === '—').length).toBeGreaterThanOrEqual(4); // usuario y los tres conteos
  });

  it('una carga sin reporte (404) lo explica en vez de mostrar un error', async () => {
    fixture.componentInstance['historial'].set([carga({ id: 4, resultado: 'FALLIDA', resumen: null })]);
    await estable();
    (html().querySelector('table.cargas .enlace') as HTMLButtonElement).click();
    http.expectOne((x) => x.url.endsWith('/ingestion/4/quality-report')).flush({ status: 404 }, { status: 404, statusText: 'Not Found' });
    await estable();
    expect(html().querySelector('#t-reporte')!.closest('section')!.textContent).toContain('no generó reporte de calidad');
  });

  it('si el historial no carga, muestra el motivo y reintenta', async () => {
    void fixture.componentInstance['cargarHistorial']();
    http.expectOne((x) => x.url.endsWith('/ingestion/history')).error(new ProgressEvent('error'), { status: 0, statusText: 'x' });
    await estable();
    expect(html().textContent).toContain('No se pudo leer el historial');
    (Array.from(html().querySelectorAll('.alerta button')).find((b) => b.textContent?.includes('Reintentar')) as HTMLButtonElement).click();
    http.expectOne((x) => x.url.endsWith('/ingestion/history')).flush([]);
    await estable();
    expect(html().textContent).toContain('Todavía no se ha cargado ningún archivo');
  });
});
