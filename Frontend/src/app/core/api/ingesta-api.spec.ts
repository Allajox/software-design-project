import { CargaApi, ReporteCalidadApi } from './modelos-api';
import {
  FUENTES_API, erroresACsv, erroresRecortados, porcentajeValidas, tieneReporte, totalEvaluadas, validarArchivoParaSubir,
} from './ingesta-api';

const carga = (resumen: CargaApi['resumen']): CargaApi => ({
  id: 1, fecha: '2026-11-09T10:00:00', fuente: 'COSEVI', resultado: 'EXITOSA', usuarioId: 1, usuario: 'Ana', archivo: 'a.csv',
  perfil: 'cosevi-siniestros', mensaje: null, checksum: null, resumen,
});

describe('Carga de datos conectada al servidor', () => {
  describe('fuentes', () => {
    it('COSEVI e INEC se pueden cargar; MOPT e IMN están pendientes (su perfil está deshabilitado en el backend)', () => {
      const disponibles = FUENTES_API.filter((f) => !f.pendiente).map((f) => f.valor);
      expect(disponibles).toEqual(['COSEVI', 'INEC']);
      expect(FUENTES_API.find((f) => f.valor === 'MOPT')?.pendiente).toBeTruthy();
      expect(FUENTES_API.find((f) => f.valor === 'IMN')?.pendiente).toBeTruthy();
    });
  });

  describe('validarArchivoParaSubir', () => {
    it('acepta CSV, JSON, GeoJSON y xlsx, sin importar mayúsculas', () => {
      for (const n of ['a.csv', 'A.CSV', 'x.json', 'red.geojson', 'libro.xlsx']) {
        expect(validarArchivoParaSubir(n, 1000)).toBeNull();
      }
    });
    it('rechaza vacío, .xls, otros formatos y archivos de más de 200 MB', () => {
      expect(validarArchivoParaSubir('a.csv', 0)).toContain('vacío');
      expect(validarArchivoParaSubir('viejo.xls', 10)).toContain('.xlsx');
      expect(validarArchivoParaSubir('nota.txt', 10)).toContain('Formato no soportado');
      expect(validarArchivoParaSubir('foto.png', 10)).toContain('Formato no soportado');
      expect(validarArchivoParaSubir('enorme.csv', 201 * 1024 * 1024)).toContain('200 MB');
      expect(validarArchivoParaSubir('justo.csv', 200 * 1024 * 1024)).toBeNull();
    });
  });

  describe('conteos', () => {
    it('totalEvaluadas no cuenta los omitidos', () => {
      expect(totalEvaluadas({ validos: 31, incompletos: 4, corruptos: 2 })).toBe(37);
    });
    it('porcentajeValidas es 0 si no se evaluó nada (sin dividir entre cero)', () => {
      expect(porcentajeValidas({ validos: 0, incompletos: 0, corruptos: 0 })).toBe(0);
      expect(porcentajeValidas({ validos: 3, incompletos: 1, corruptos: 0 })).toBe(75);
    });
  });

  describe('tieneReporte', () => {
    it('una carga rechazada antes de evaluar filas no tiene reporte', () => {
      expect(tieneReporte(carga(null))).toBe(false);
      expect(tieneReporte(carga({ validos: 0, incompletos: 0, corruptos: 0, omitidos: 0 }))).toBe(false);
    });
    it('una carga que evaluó filas sí', () => {
      expect(tieneReporte(carga({ validos: 10, incompletos: 0, corruptos: 1, omitidos: 0 }))).toBe(true);
      expect(tieneReporte(carga({ validos: 0, incompletos: 0, corruptos: 0, omitidos: 5 }))).toBe(true);
    });
  });

  describe('reporte de calidad', () => {
    const reporte = (errores: string[], incompletos: number, corruptos: number): ReporteCalidadApi => ({
      idCarga: 7, validos: 10, incompletos, corruptos, omitidos: 0, errores,
    });
    it('detecta cuándo el servidor recortó la lista de errores (los contadores son exactos)', () => {
      expect(erroresRecortados(reporte(['a', 'b'], 1, 1))).toBe(false);
      expect(erroresRecortados(reporte(['a'], 1, 1))).toBe(true);
    });
    it('el CSV de errores escapa las comillas y no inventa columnas', () => {
      const csv = erroresACsv(reporte(['Fila 3: valor no válido en "Año"', 'Fila 4: x'], 0, 2));
      expect(csv.split('\r\n')).toEqual(['Detalle', '"Fila 3: valor no válido en ""Año"""', '"Fila 4: x"']);
    });
  });
});
