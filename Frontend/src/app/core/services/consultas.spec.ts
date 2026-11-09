import { ConsultaGuardada } from '../models/consulta.models';
import { filtrosVacios } from '../models/siniestro.models';
import {
  LARGO_MAX_NOMBRE, MAX_RECIENTES, agregarReciente, claveFiltros, sanitizarAlmacen, sanitizarFiltros,
  validarNombreConsulta,
} from './consultas';

const conAnios = (anios: number[]) => ({ ...filtrosVacios(), anios: anios as never[] });

describe('Historial de consultas (RF-5)', () => {
  describe('claveFiltros', () => {
    it('es igual aunque las opciones se hayan marcado en otro orden', () => {
      expect(claveFiltros(conAnios([2024, 2023]))).toBe(claveFiltros(conAnios([2023, 2024])));
    });

    it('cambia cuando cambia algún filtro', () => {
      expect(claveFiltros(conAnios([2024]))).not.toBe(claveFiltros(conAnios([2023])));
      expect(claveFiltros({ ...filtrosVacios(), ruta: 'Ruta 1' })).not.toBe(claveFiltros(filtrosVacios()));
    });
  });

  describe('sanitizarFiltros (datos del almacenamiento nunca son de fiar)', () => {
    it('devuelve filtros vacíos si lo guardado no es un objeto', () => {
      for (const basura of [null, undefined, 42, 'texto', [], true]) {
        expect(sanitizarFiltros(basura)).toEqual(filtrosVacios());
      }
    });

    it('descarta valores que no están en los catálogos', () => {
      const f = sanitizarFiltros({
        provincia: 'Narnia', ruta: 'Ruta 999', anios: [2024, 1999, 'x'], meses: [1, 13, 0],
        severidades: ['Leve', '<script>'], dias: 'Lunes',
      });
      expect(f.provincia).toBe('');
      expect(f.ruta).toBe('');
      expect(f.anios).toEqual([2024]);
      expect(f.meses).toEqual([1]);
      expect(f.severidades).toEqual(['Leve']);
      expect(f.dias).toEqual([]);
    });

    it('conserva lo válido', () => {
      const f = sanitizarFiltros({ provincia: 'San José', anios: [2023, 2025], generos: ['Femenino'] });
      expect(f.provincia).toBe('San José');
      expect(f.anios).toEqual([2023, 2025]);
    });
  });

  describe('sanitizarAlmacen', () => {
    it('tolera un almacén vacío o dañado', () => {
      expect(sanitizarAlmacen(null)).toEqual({ guardadas: [], recientes: [] });
      expect(sanitizarAlmacen({ guardadas: 'no', recientes: 7 })).toEqual({ guardadas: [], recientes: [] });
    });

    it('descarta entradas sin id o sin nombre y arregla fechas inválidas', () => {
      const a = sanitizarAlmacen({
        guardadas: [
          { id: 'a', nombre: '  Mi consulta  ', filtros: {}, creadaEn: 'no es fecha' },
          { id: '', nombre: 'sin id', filtros: {} },
          { id: 'c', nombre: '   ', filtros: {} },
          null,
        ],
        recientes: [{ id: 'r1', filtros: {}, fecha: '2025-01-01T10:00:00.000Z' }, { filtros: {} }],
      });
      expect(a.guardadas.length).toBe(1);
      expect(a.guardadas[0].nombre).toBe('Mi consulta');
      expect(Number.isNaN(Date.parse(a.guardadas[0].creadaEn))).toBe(false);
      expect(a.recientes.length).toBe(1);
    });

    it('quita caracteres de control y recorta nombres demasiado largos', () => {
      const a = sanitizarAlmacen({
        guardadas: [{ id: 'a', nombre: 'Hola\u0000\n' + 'x'.repeat(200), filtros: {}, creadaEn: '2025-01-01' }],
      });
      expect(a.guardadas[0].nombre).not.toMatch(/[\u0000-\u001f]/);
      expect(a.guardadas[0].nombre.length).toBeLessThanOrEqual(LARGO_MAX_NOMBRE);
    });
  });

  describe('agregarReciente', () => {
    const t = (n: number) => new Date(2025, 0, 1, 10, n);

    it('pone la consulta nueva primero', () => {
      let l = agregarReciente([], conAnios([2023]), 'a', t(0));
      l = agregarReciente(l, conAnios([2024]), 'b', t(1));
      expect(l.map((r) => r.id)).toEqual(['b', 'a']);
    });

    it('no repite la misma combinación: la sube y le pone fecha nueva', () => {
      let l = agregarReciente([], conAnios([2023, 2024]), 'a', t(0));
      l = agregarReciente(l, conAnios([2025]), 'b', t(1));
      l = agregarReciente(l, conAnios([2024, 2023]), 'c', t(2)); // misma que 'a', en otro orden
      expect(l.map((r) => r.id)).toEqual(['c', 'b']);
      expect(l[0].fecha).toBe(t(2).toISOString());
    });

    it(`guarda como máximo ${MAX_RECIENTES} y descarta las más viejas`, () => {
      let l: ReturnType<typeof agregarReciente> = [];
      for (let i = 0; i < MAX_RECIENTES + 5; i++) {
        l = agregarReciente(l, { ...filtrosVacios(), distrito: `D${i}` }, `id${i}`, t(i % 59));
      }
      expect(l.length).toBe(MAX_RECIENTES);
      expect(l[0].id).toBe(`id${MAX_RECIENTES + 4}`);
      expect(l.some((r) => r.id === 'id0')).toBe(false);
    });

    it('no modifica la lista original', () => {
      const original = agregarReciente([], conAnios([2023]), 'a', t(0));
      const copia = [...original];
      agregarReciente(original, conAnios([2024]), 'b', t(1));
      expect(original).toEqual(copia);
    });
  });

  describe('validarNombreConsulta', () => {
    const existentes: ConsultaGuardada[] = [
      { id: '1', nombre: 'Ruta 32 en lluvia', filtros: filtrosVacios(), creadaEn: '2025-01-01T00:00:00.000Z' },
    ];

    it('acepta un nombre normal', () => {
      expect(validarNombreConsulta('Fines de semana', existentes)).toBeNull();
    });

    it('rechaza nombres muy cortos (ignora espacios de los bordes)', () => {
      expect(validarNombreConsulta('  ab  ', existentes)).toMatch(/al menos 3/);
      expect(validarNombreConsulta('', existentes)).toMatch(/al menos 3/);
    });

    it('rechaza nombres demasiado largos', () => {
      expect(validarNombreConsulta('x'.repeat(LARGO_MAX_NOMBRE + 1), existentes)).toMatch(/no puede pasar/);
      expect(validarNombreConsulta('x'.repeat(LARGO_MAX_NOMBRE), existentes)).toBeNull();
    });

    it('rechaza nombres repetidos sin importar mayúsculas', () => {
      expect(validarNombreConsulta('RUTA 32 EN LLUVIA', existentes)).toMatch(/Ya existe/);
    });

    it('al renombrar, su propio nombre no cuenta como repetido', () => {
      expect(validarNombreConsulta('Ruta 32 en lluvia', existentes, '1')).toBeNull();
      expect(validarNombreConsulta('Ruta 32 en lluvia', existentes, 'otro')).toMatch(/Ya existe/);
    });
  });
});
