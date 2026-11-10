import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../config/api.config';
import { ConsultasApiService } from './consultas-api.service';
import { IngestaApiService } from './ingesta-api.service';
import { RegistrosApiService, TAMANO_MAXIMO_PAGINA } from './registros-api.service';

describe('Servicios HTTP del backend', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('RegistrosApiService', () => {
    it('hace POST /records/search con los criterios en el cuerpo y page, size y sort en la URL', () => {
      TestBed.inject(RegistrosApiService).buscar({ provincia: 'HEREDIA', anio: 2024 }, 2, 50, { campo: 'canton', direccion: 'desc' }).subscribe();
      const r = http.expectOne((req) => req.url === `${API_CONFIG.baseUrl}/records/search`);
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual({ provincia: 'HEREDIA', anio: 2024 });
      expect(r.request.params.get('page')).toBe('2');
      expect(r.request.params.get('size')).toBe('50');
      expect(r.request.params.get('sort')).toBe('canton:desc');
      r.flush({ items: [], total: 0, pagina: 2, tamano: 50, totalPaginas: 0 });
    });

    it('sin orden no manda sort, y nunca pide más de lo que el servidor permite por página', () => {
      TestBed.inject(RegistrosApiService).buscar({}, 0, 999, null).subscribe();
      const r = http.expectOne((req) => req.url.endsWith('/records/search'));
      expect(r.request.params.has('sort')).toBe(false);
      expect(r.request.params.get('size')).toBe(String(TAMANO_MAXIMO_PAGINA));
      r.flush({ items: [], total: 0, pagina: 0, tamano: 200, totalPaginas: 0 });
    });
  });

  describe('ConsultasApiService', () => {
    it('lista guardadas e historial con GET', () => {
      const s = TestBed.inject(ConsultasApiService);
      s.guardadas().subscribe();
      s.historial().subscribe();
      expect(http.expectOne(`${API_CONFIG.baseUrl}/queries/saved`).request.method).toBe('GET');
      expect(http.expectOne(`${API_CONFIG.baseUrl}/queries/history`).request.method).toBe('GET');
    });

    it('guarda con POST {nombre, criterios}', () => {
      TestBed.inject(ConsultasApiService).guardar('Heredia de noche', { provincia: 'HEREDIA', franja: 'NOCHE' }).subscribe();
      const r = http.expectOne(`${API_CONFIG.baseUrl}/queries/saved`);
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual({ nombre: 'Heredia de noche', criterios: { provincia: 'HEREDIA', franja: 'NOCHE' } });
    });
  });

  describe('IngestaApiService', () => {
    it('sube el archivo como multipart con los campos "file" y "fuente" (como espera IngestionController)', () => {
      const archivo = new File(['a;b\r\n1;2'], 'datos.csv', { type: 'text/csv' });
      TestBed.inject(IngestaApiService).subir(archivo, 'COSEVI').subscribe();
      const r = http.expectOne(`${API_CONFIG.baseUrl}/ingestion/upload`);
      expect(r.request.method).toBe('POST');
      const datos = r.request.body as FormData;
      expect(datos).toBeInstanceOf(FormData);
      expect((datos.get('file') as File).name).toBe('datos.csv');
      expect(datos.get('fuente')).toBe('COSEVI');
    });

    it('lee el historial y el reporte de calidad de una carga', () => {
      const s = TestBed.inject(IngestaApiService);
      s.historial().subscribe();
      s.reporte(12).subscribe();
      expect(http.expectOne(`${API_CONFIG.baseUrl}/ingestion/history`).request.method).toBe('GET');
      expect(http.expectOne(`${API_CONFIG.baseUrl}/ingestion/12/quality-report`).request.method).toBe('GET');
    });
  });
});
