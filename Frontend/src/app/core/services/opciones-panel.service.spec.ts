import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OpcionesPanelApi, OpcionesPanelService } from './opciones-panel.service';

const respuesta: OpcionesPanelApi = {
  provincias: ['San José', 'Cartago'],
  cantones: { 'San José': ['Escazú', 'Alajuelita'], Cartago: ['Alvarado', 'Turrialba'] },
  distritos: { Alvarado: ['Capellades', 'Pacayas'], Escazú: ['San Rafael'] },
  rutas: ['Ruta 1', 'Ruta 2', 'Ruta 10'],
  anios: [2020, 2021],
  vehiculos: ['Automóvil', 'Motocicleta'],
};

describe('OpcionesPanelService', () => {
  let http: HttpTestingController;
  let srv: OpcionesPanelService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    srv = TestBed.inject(OpcionesPanelService);
    TestBed.tick();
    http.expectOne((r) => r.url.endsWith('/dashboard/opciones')).flush(respuesta);
    TestBed.tick();
    await Promise.resolve();
  });
  afterEach(() => http.verify());

  it('guarda lo que devuelve el servidor', () => {
    expect(srv.datos().anios).toEqual([2020, 2021]);
    expect(srv.datos().rutas).toHaveLength(3);
  });

  it('con provincia elegida da solo sus cantones', () => {
    expect(srv.cantones('Cartago')).toEqual(['Alvarado', 'Turrialba']);
    expect(srv.cantones('Limón')).toEqual([]);
  });

  it('sin provincia da todos los cantones en orden alfabético', () => {
    expect(srv.cantones('')).toEqual(['Alajuelita', 'Alvarado', 'Escazú', 'Turrialba']);
  });

  it('los distritos dependen del cantón (sin cantón, ninguno)', () => {
    expect(srv.distritos('Alvarado')).toEqual(['Capellades', 'Pacayas']);
    expect(srv.distritos('')).toEqual([]);
    expect(srv.distritos('Desconocido')).toEqual([]);
  });

  it('encuentra la provincia de un cantón', () => {
    expect(srv.provinciaDe('Escazú')).toBe('San José');
    expect(srv.provinciaDe('Turrialba')).toBe('Cartago');
    expect(srv.provinciaDe('Nada')).toBe('');
  });
});
