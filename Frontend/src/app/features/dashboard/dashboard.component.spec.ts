import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsultaGuardadaApi } from '../../core/api/modelos-api';
import { AuthService } from '../../core/services/auth.service';
import { FiltrosPanelService } from '../../core/services/filtros-panel.service';
import { OpcionesPanelApi } from '../../core/services/opciones-panel.service';
import { imitarDialogoNativo } from '../../shared/testing/dialogo-jsdom';
import { DashboardComponent } from './dashboard.component';

const opciones: OpcionesPanelApi = {
  provincias: ['San José', 'Heredia', 'Limón'],
  cantones: { 'San José': ['Escazú'], Heredia: ['Barva', 'Belén'], Limón: ['Pococí'] },
  distritos: { Barva: ['San Pedro'] },
  rutas: ['Ruta 1', 'Ruta 2', 'Ruta 32'],
  anios: [2023, 2024],
  vehiculos: ['Automóvil', 'Motocicleta'],
};

const panel = {
  kpis: {
    siniestros: 1200, totalRegistros: 93_699, tsv: 12.8, iss: 2.14, tpr: null, victimas: 1500,
    fallecidos: 30, heridosGraves: 170, heridosLeves: 1300, ic: 14.6,
  },
  porProvincia: [],
  porSeveridad: [],
  porVehiculo: [
    { etiqueta: 'Motocicleta', valor: 900, porcentaje: 60, tasaFatalidad: 1.9 },
    { etiqueta: 'Automóvil', valor: 500, porcentaje: 33, tasaFatalidad: 0.6 },
    { etiqueta: 'Peatón', valor: 100, porcentaje: 7, tasaFatalidad: 4.3 },
  ],
  rutasPrincipales: [
    { etiqueta: 'Ruta 2', valor: 300, porcentaje: 60, acumulado: 60 },
    { etiqueta: 'Ruta 1', valor: 200, porcentaje: 40, acumulado: 100 },
  ],
  matrizDiaFranja: {
    dias: ['Lunes', 'Martes'], franjas: ['Madrugada', 'Mañana', 'Tarde', 'Noche'],
    valores: [[10, 20, 30, 40], [5, 6, 7, 8]], maximo: 40,
  },
  perfilDemografico: { edades: ['>60', '18-25'], masculino: [3, 9], femenino: [2, 4] },
};

describe('DashboardComponent (Panel de indicadores)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DashboardComponent>;
  let rol: boolean;
  let descargas: string[];

  const html = (): HTMLElement => fixture.nativeElement as HTMLElement;
  /** Parámetros de la última petición al panel que se contestó (las peticiones contestadas ya no quedan pendientes) */
  let ultimaQuery = new URLSearchParams();
  const paneles = (): TestRequest[] => http.match((r) => r.url.endsWith('/dashboard'));
  const estable = async () => { await fixture.whenStable(); await new Promise((r) => setTimeout(r)); fixture.detectChanges(); };
  /** Contesta la petición de opciones y la(s) del panel que haya pendientes con los datos de prueba */
  const responder = async (datos: object = panel) => {
    TestBed.tick();
    for (const r of http.match((x) => x.url.endsWith('/dashboard/opciones'))) r.flush(opciones);
    for (const r of paneles()) {
      ultimaQuery = new URLSearchParams(r.request.urlWithParams.split('?')[1] ?? '');
      r.flush(datos);
    }
    await estable();
  };
  const lista = (clave: string) => html().querySelector<HTMLSelectElement>(`select[data-clave="${clave}"]`)!;
  const elegir = async (clave: string, valor: string, datos: object = panel) => {
    const s = lista(clave);
    s.value = valor;
    s.dispatchEvent(new Event('change'));
    await responder(datos);
  };
  const boton = (texto: string): HTMLButtonElement =>
    Array.from(html().querySelectorAll('button')).find((b) => b.textContent?.trim().includes(texto)) as HTMLButtonElement;
  const ultimaPeticionPanel = (): URLSearchParams => ultimaQuery;
  /** Texto de la pantalla con los espacios (incluidos los de miles) como espacios normales */
  const texto = (): string => (html().textContent ?? '').replace(/\s+/g, ' ');

  beforeEach(async () => {
    imitarDialogoNativo();
    // jsdom no descarga archivos: se deja pasar el clic en el enlace y se anota el nombre del archivo
    URL.createObjectURL ??= () => 'blob:prueba';
    URL.revokeObjectURL ??= () => undefined;
    descargas = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download);
    });
    rol = true;
    ultimaQuery = new URLSearchParams();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { tieneRol: () => rol } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(FiltrosPanelService).limpiar();
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.tick();
    http.match(() => true);
  });

  it('al abrirse pide el panel sin filtros y muestra los 4 indicadores con su formato', async () => {
    TestBed.tick();
    const primera = paneles();
    expect(primera).toHaveLength(1);
    expect(primera[0].request.params.keys()).toHaveLength(0);
    expect(primera[0].request.urlWithParams).not.toContain('?');
    primera[0].flush(panel);
    await responder();
    const textos = Array.from(html().querySelectorAll('app-indicador')).map((i) => i.textContent?.replace(/\s+/g, ' ').trim());
    expect(textos).toHaveLength(4);
    expect(textos[0]).toContain('Tasa de siniestralidad vial (TSV)');
    expect(textos[0]).toContain('12,8');
    expect(textos[1]).toContain('2,14');
    // La fuente COSEVI no trae tiempos de respuesta: se dice, en vez de mostrar 0
    expect(textos[2]).toContain('—');
    expect(textos[2]).toContain('La fuente (COSEVI) no trae este dato');
    expect(textos[3]).toContain('14,6');
    expect(texto()).toContain('93 699 registros válidos');
  });

  it('muestra 13 listas con una sola opción y «Todos» elegido al comienzo', async () => {
    await responder();
    const listas = html().querySelectorAll('select');
    expect(listas).toHaveLength(13);
    expect(Array.from(listas).every((s) => s.value === '' && !s.multiple)).toBe(true);
    expect(lista('distrito').disabled).toBe(true);
  });

  it('las listas de cantón, distrito, ruta, año y vehículo salen de lo que devuelve el servidor', async () => {
    await responder();
    const valores = (c: string) => Array.from(lista(c).options).map((o) => o.value).filter(Boolean);
    expect(valores('anio')).toEqual(['2023', '2024']);
    expect(valores('ruta')).toEqual(['Ruta 1', 'Ruta 2', 'Ruta 32']);
    expect(valores('vehiculo')).toEqual(['Automóvil', 'Motocicleta']);
    await elegir('provincia', 'Heredia');
    expect(valores('canton')).toEqual(['Barva', 'Belén']);
    await elegir('canton', 'Barva');
    expect(lista('distrito').disabled).toBe(false);
    expect(valores('distrito')).toEqual(['San Pedro']);
  });

  it('cada filtro viaja al servidor con una sola opción', async () => {
    await responder();
    await elegir('provincia', 'Limón');
    await elegir('anio', '2024');
    await elegir('dia', 'Lunes');
    const q = ultimaPeticionPanel();
    expect(q.get('provincia')).toBe('Limón');
    expect(q.getAll('anios')).toEqual(['2024']);
    expect(q.getAll('dias')).toEqual(['Lunes']);
    expect(texto()).toContain('3 filtros activos');
  });

  it('un clic en un día del mapa de calor filtra por ese día y otro clic lo quita', async () => {
    await responder();
    const lunes = Array.from(html().querySelectorAll<HTMLButtonElement>('app-mapa-calor button')).find((b) => b.textContent?.includes('Lunes'))!;
    lunes.click();
    await responder();
    expect(ultimaPeticionPanel().getAll('dias')).toEqual(['Lunes']);
    expect(lista('dia').value).toBe('Lunes');
    Array.from(html().querySelectorAll<HTMLButtonElement>('app-mapa-calor button')).find((b) => b.textContent?.includes('Lunes'))!.click();
    await responder();
    expect(lista('dia').value).toBe('');
  });

  it('un clic en una barra del Pareto filtra por esa ruta', async () => {
    await responder();
    html().querySelectorAll('app-columnas')[0].querySelector<HTMLButtonElement>('button.barra')!.click();
    await responder();
    expect(ultimaPeticionPanel().get('ruta')).toBe('Ruta 2');
    expect(lista('ruta').value).toBe('Ruta 2');
  });

  it('la pestaña «Perfil de víctimas y riesgo» muestra personas, género y edad y fatalidad por vehículo', async () => {
    await responder();
    boton('Perfil de víctimas y riesgo').click();
    await estable();
    expect(html().querySelector('#panel-perfil')).not.toBeNull();
    expect(html().querySelector('#panel-resumen')).toBeNull();
    expect(texto()).toContain('1 500 personas afectadas: 30 fallecidas · 170 heridas graves · 1 300 heridas leves');
    expect(html().querySelectorAll('app-columnas')).toHaveLength(2);
    // «Peatón» es un grupo de la gráfica, no un tipo de vehículo de los datos: no sirve como filtro
    const barras = html().querySelectorAll('app-columnas')[1].querySelectorAll<HTMLButtonElement>('button.barra');
    barras[0].click(); // Peatón (la tasa más alta va primero)
    await responder();
    expect(lista('vehiculo').value).toBe('');
    barras[1].click(); // Motocicleta
    await responder();
    expect(ultimaPeticionPanel().getAll('vehiculos')).toEqual(['Motocicleta']);
  });

  it('un clic en una barra de género y edad elige las dos cosas', async () => {
    await responder();
    boton('Perfil de víctimas y riesgo').click();
    await estable();
    html().querySelectorAll('app-columnas')[0].querySelector<HTMLButtonElement>('button.barra')!.click();
    await responder();
    const q = ultimaPeticionPanel();
    expect(q.getAll('edades')).toHaveLength(1);
    expect(q.getAll('generos')).toHaveLength(1);
  });

  it('avisa cuando un filtro elegido no cambia lo que muestra la pestaña abierta', async () => {
    await responder();
    expect(html().querySelector('.alcance')).toBeNull();
    await elegir('genero', 'Femenino');
    expect(html().querySelector('.alcance')?.textContent).toContain('El filtro de género solo aplica a datos de personas');
    boton('Perfil de víctimas y riesgo').click();
    await estable();
    expect(html().querySelector('.alcance')).toBeNull();
    await elegir('clima', 'Lluvia');
    expect(html().querySelector('.alcance')?.textContent).toContain('El filtro de clima solo aplica a datos de siniestros');
  });

  it('si ningún siniestro cumple los filtros lo dice y permite limpiarlos', async () => {
    await responder();
    await elegir('provincia', 'Limón', { ...panel, kpis: { ...panel.kpis, siniestros: 0 } });
    expect(texto()).toContain('Ningún siniestro cumple estos filtros');
    boton('Limpiar filtros').click();
    await responder();
    expect(lista('provincia').value).toBe('');
    expect(texto()).not.toContain('Ningún siniestro cumple');
  });

  it('el menú de exportación ofrece CSV, Excel y PDF y se cierra con Escape', async () => {
    await responder();
    boton('Exportar CSV - Excel - PDF').click();
    await estable();
    expect(Array.from(html().querySelectorAll('[role="menuitem"]')).map((b) => b.textContent?.trim())).toEqual([
      'CSV', 'Excel (.xlsx)', 'PDF',
    ]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await estable();
    expect(html().querySelector('[role="menu"]')).toBeNull();
  });

  it('exportar pide /dashboard/export con los mismos filtros y el formato elegido', async () => {
    await responder();
    await elegir('provincia', 'Heredia');
    boton('Exportar CSV - Excel - PDF').click();
    await estable();
    (Array.from(html().querySelectorAll('[role="menuitem"]')).find((b) => b.textContent?.includes('PDF')) as HTMLButtonElement).click();
    const r = http.expectOne((x) => x.url.endsWith('/dashboard/export'));
    expect(r.request.params.get('provincia')).toBe('Heredia');
    expect(r.request.params.get('formato')).toBe('pdf');
    expect(r.request.responseType).toBe('blob');
    r.flush(new Blob(['x']));
    expect(descargas).toHaveLength(1);
    expect(descargas[0]).toMatch(/^sivcr-dashboard.*\.pdf$/);
  });

  it('«Guardar filtros» está apagado sin filtros; con filtros guarda los criterios con el formato del servidor', async () => {
    await responder();
    expect(boton('Guardar filtros').disabled).toBe(true);
    await elegir('provincia', 'San José');
    await elegir('franja', 'Mañana');
    await elegir('vehiculo', 'Motocicleta');
    boton('Guardar filtros').click();
    await estable();
    const dialogo = html().querySelector('app-dialogo-guardar-consulta-api')!;
    expect(dialogo.textContent).toContain('Provincia: San José');
    expect(dialogo.textContent).toContain('(no se guarda)');
    const campo = dialogo.querySelector<HTMLInputElement>('input[type="text"]')!;
    campo.value = 'San José de mañana';
    campo.dispatchEvent(new Event('input'));
    (Array.from(dialogo.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Guardar') as HTMLButtonElement).click();
    const r = http.expectOne((x) => x.url.endsWith('/queries/saved'));
    expect(r.request.body).toEqual({
      nombre: 'San José de mañana', criterios: { provincia: 'SAN_JOSE', franja: 'MANANA' },
    });
    const guardada: ConsultaGuardadaApi = { id: 1, nombre: 'San José de mañana', criterios: {}, creadoEn: '2026-11-09T00:00:00' };
    r.flush(guardada);
    await estable();
  });

  it('quien no analiza (consultor público) no ve «Guardar filtros»', async () => {
    rol = false;
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await responder();
    expect(boton('Guardar filtros')).toBeUndefined();
  });

  it('si el servidor no responde, el subtítulo lo dice', async () => {
    TestBed.tick();
    http.match((x) => x.url.endsWith('/dashboard/opciones')).forEach((r) => r.flush(opciones));
    paneles()[0].error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await estable();
    expect(html().querySelector('.subtitulo')?.textContent).toContain('no se pudo conectar con el servidor');
  });

  it('las flechas pasan de una pestaña a la otra', async () => {
    await responder();
    html().querySelector('[role="tablist"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await estable();
    expect(html().querySelector('#pestana-perfil')?.getAttribute('aria-selected')).toBe('true');
  });
});
