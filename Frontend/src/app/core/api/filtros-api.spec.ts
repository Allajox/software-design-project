import { CriteriosApi } from './modelos-api';
import {
  ANIO_MAX, ANIO_MIN, aCriterios, contarFiltrosActivos, desdeCriterios, enteroDeTexto, filtrosApiVacios, filtrosIguales,
  validarFiltrosApi,
} from './filtros-api';

describe('Filtros de la pantalla conectada al servidor', () => {
  describe('aCriterios', () => {
    it('sin filtros manda un cuerpo vacío (nada de ceros ni textos vacíos)', () => {
      expect(aCriterios(filtrosApiVacios())).toEqual({});
    });

    it('manda solo lo que tiene valor y limpia los espacios', () => {
      const c = aCriterios({
        ...filtrosApiVacios(), provincia: 'HEREDIA', canton: '  Santo   Domingo ', anio: 2024, mes: 7, franja: 'NOCHE', ruta: '   ',
      });
      expect(c).toEqual({ provincia: 'HEREDIA', canton: 'Santo Domingo', anio: 2024, mes: 7, franja: 'NOCHE' });
      expect('ruta' in c).toBe(false);
    });
  });

  describe('desdeCriterios (lo que devuelve el servidor)', () => {
    it('entiende 0 y null como "sin filtro" en año y mes', () => {
      const f = desdeCriterios({ anio: 0, mes: 0, edadMin: 0, edadMax: 0 });
      expect(f).toEqual(filtrosApiVacios());
      expect(desdeCriterios({ anio: null, mes: null })).toEqual(filtrosApiVacios());
    });

    it('acepta criterios completos', () => {
      const c: CriteriosApi = {
        provincia: 'CARTAGO', canton: 'Paraíso', distrito: null, ruta: '2', anio: 2023, mes: 3, diaSemana: 'LUNES',
        franja: 'MANANA', severidad: 'CON_MUERTOS_O_GRAVES', clima: 'LLUVIA', calzada: 'HUECOS',
      };
      expect(desdeCriterios(c)).toEqual({
        provincia: 'CARTAGO', canton: 'Paraíso', distrito: '', ruta: '2', anio: 2023, mes: 3, diaSemana: 'LUNES',
        franja: 'MANANA', severidad: 'CON_MUERTOS_O_GRAVES', clima: 'LLUVIA', calzada: 'HUECOS',
      });
    });

    it('descarta valores que no están en los catálogos, meses imposibles y lo que no es de siniestros', () => {
      const f = desdeCriterios({
        provincia: 'MARTE' as never, mes: 13, severidad: 'OTRA' as never, edadMin: 20, edadMax: 40, genero: 'MASCULINO',
        tipoVehiculo: 'MOTOCICLETA',
      });
      expect(f).toEqual(filtrosApiVacios());
    });

    it('no se rompe con datos que no son un objeto', () => {
      expect(desdeCriterios(null)).toEqual(filtrosApiVacios());
      expect(desdeCriterios(undefined)).toEqual(filtrosApiVacios());
    });

    it('lo que sale de aCriterios vuelve igual con desdeCriterios', () => {
      const f = { ...filtrosApiVacios(), provincia: 'LIMON', anio: 2025, mes: 12, clima: 'NEBLINA', canton: 'Pococí' };
      expect(desdeCriterios(aCriterios(f))).toEqual(f);
    });
  });

  it('cuenta los filtros activos', () => {
    expect(contarFiltrosActivos(filtrosApiVacios())).toBe(0);
    expect(contarFiltrosActivos({ ...filtrosApiVacios(), provincia: 'HEREDIA', anio: 2024, canton: '  ' })).toBe(2);
  });

  it('compara por criterios, no por espacios', () => {
    const a = { ...filtrosApiVacios(), canton: 'Heredia' };
    expect(filtrosIguales(a, { ...a, canton: ' Heredia ' })).toBe(true);
    expect(filtrosIguales(a, { ...a, canton: 'Belén' })).toBe(false);
  });

  describe('validación del año (igual que el servidor)', () => {
    it('acepta vacío y años dentro del rango', () => {
      expect(validarFiltrosApi(filtrosApiVacios())).toBeNull();
      expect(validarFiltrosApi({ ...filtrosApiVacios(), anio: ANIO_MIN })).toBeNull();
      expect(validarFiltrosApi({ ...filtrosApiVacios(), anio: ANIO_MAX })).toBeNull();
    });
    it('rechaza fuera de rango', () => {
      expect(validarFiltrosApi({ ...filtrosApiVacios(), anio: ANIO_MIN - 1 })).toContain('entre');
      expect(validarFiltrosApi({ ...filtrosApiVacios(), anio: ANIO_MAX + 1 })).toContain('entre');
    });
  });

  describe('enteroDeTexto', () => {
    it('lee enteros de hasta 4 cifras', () => {
      expect(enteroDeTexto('2024')).toBe(2024);
      expect(enteroDeTexto(' 1999 ')).toBe(1999);
    });
    it('lo demás es "sin filtro"', () => {
      for (const t of ['', '  ', 'abc', '20x4', '-5', '2024.5', '12345']) expect(enteroDeTexto(t)).toBeNull();
    });
  });
});
