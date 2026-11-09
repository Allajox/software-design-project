import { generarSiniestros } from '../data/generador-siniestros';
import { filtrosVacios } from '../models/siniestro.models';
import { aCsv, construirTabla, neutralizarFormula, nombreArchivo } from './exportacion';
import { resumirFiltros } from './filtros-resumen';
import {
  COLUMNAS, alternarCriterio, ordenarSiniestros, paginar, totalPaginas, ventanaPaginas,
} from './tabla-siniestros';

const datos = generarSiniestros(300, 11);

describe('Ordenamiento multinivel (RF-4)', () => {
  it('ordena por una columna, ascendente y descendente', () => {
    const asc = ordenarSiniestros(datos, [{ clave: 'kilometro', direccion: 'asc' }]);
    const desc = ordenarSiniestros(datos, [{ clave: 'kilometro', direccion: 'desc' }]);
    expect(asc[0].kilometro).toBe(Math.min(...datos.map((s) => s.kilometro)));
    expect(desc[0].kilometro).toBe(Math.max(...datos.map((s) => s.kilometro)));
  });

  it('el segundo criterio desempata al primero', () => {
    const r = ordenarSiniestros(datos, [
      { clave: 'provincia', direccion: 'asc' },
      { clave: 'kilometro', direccion: 'desc' },
    ]);
    for (let i = 1; i < r.length; i++) {
      if (r[i].provincia === r[i - 1].provincia) {
        expect(r[i].kilometro).toBeLessThanOrEqual(r[i - 1].kilometro);
      } else {
        expect(r[i].provincia.localeCompare(r[i - 1].provincia, 'es')).toBeGreaterThan(0);
      }
    }
  });

  it('la severidad ascendente va de menos a más grave (no alfabético)', () => {
    const r = ordenarSiniestros(datos, [{ clave: 'severidad', direccion: 'asc' }]);
    expect(r[0].severidad).toBe('Leve');
    expect(r[r.length - 1].severidad).toBe('Fallecido');
  });

  it('no modifica la lista original y es estable', () => {
    const copia = [...datos];
    const a = ordenarSiniestros(datos, [{ clave: 'franja', direccion: 'asc' }]);
    const b = ordenarSiniestros(datos, [{ clave: 'franja', direccion: 'asc' }]);
    expect(datos).toEqual(copia);
    expect(a).toEqual(b);
  });

  it('ignora claves que no existen', () => {
    expect(ordenarSiniestros(datos, [{ clave: 'inventada', direccion: 'asc' }]).length).toBe(datos.length);
  });

  it('clic normal: asc → desc → sin orden; Mayús + clic añade criterios', () => {
    let c = alternarCriterio([], 'fecha', false);
    expect(c).toEqual([{ clave: 'fecha', direccion: 'asc' }]);
    c = alternarCriterio(c, 'fecha', false);
    expect(c).toEqual([{ clave: 'fecha', direccion: 'desc' }]);
    c = alternarCriterio(c, 'fecha', false);
    expect(c).toEqual([]);

    c = alternarCriterio([{ clave: 'fecha', direccion: 'desc' }], 'ruta', true);
    expect(c).toEqual([{ clave: 'fecha', direccion: 'desc' }, { clave: 'ruta', direccion: 'asc' }]);
    c = alternarCriterio(c, 'ruta', true);
    expect(c[1]).toEqual({ clave: 'ruta', direccion: 'desc' });
    c = alternarCriterio(c, 'ruta', true);
    expect(c).toEqual([{ clave: 'fecha', direccion: 'desc' }]);
  });

  it('clic normal en otra columna reemplaza todos los criterios', () => {
    const c = alternarCriterio([{ clave: 'a', direccion: 'asc' }, { clave: 'b', direccion: 'asc' }], 'ruta', false);
    expect(c).toEqual([{ clave: 'ruta', direccion: 'asc' }]);
  });
});

describe('Paginación', () => {
  it('calcula páginas y recorta', () => {
    expect(totalPaginas(0, 25)).toBe(1);
    expect(totalPaginas(26, 25)).toBe(2);
    expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginar([1, 2, 3, 4, 5], 3, 2)).toEqual([5]);
  });

  it('la ventana de páginas usa "…" para los saltos', () => {
    expect(ventanaPaginas(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(ventanaPaginas(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(ventanaPaginas(1, 20)).toEqual([1, 2, 3, 4, '…', 20]);
    expect(ventanaPaginas(20, 20)).toEqual([1, '…', 17, 18, 19, 20]);
  });
});

describe('Exportación (CSV / Excel / PDF)', () => {
  it('la tabla tiene una fila por registro y una columna por encabezado', () => {
    const t = construirTabla(datos);
    expect(t.filas.length).toBe(datos.length);
    expect(t.columnas.length).toBe(COLUMNAS.length);
    expect(t.filas.every((f) => f.length === t.columnas.length)).toBe(true);
  });

  it('los números se exportan como números', () => {
    const t = construirTabla(datos.slice(0, 1));
    const iKm = t.columnas.indexOf('Km');
    expect(typeof t.filas[0][iKm]).toBe('number');
  });

  it('solo las columnas que caben en el PDF', () => {
    const t = construirTabla(datos, COLUMNAS.filter((c) => c.enPdf));
    expect(t.columnas.length).toBeLessThan(COLUMNAS.length);
    expect(t.columnas).not.toContain('Distrito');
  });

  it('el CSV usa ; escapa comillas y separadores y termina líneas en CRLF', () => {
    const csv = aCsv({ columnas: ['A', 'B'], filas: [['x;y', 'dice "hola"'], [1, 'ñandú']] });
    expect(csv).toBe('A;B\r\n"x;y";"dice ""hola"""\r\n1;ñandú');
  });

  it('neutraliza fórmulas peligrosas pero deja pasar los números negativos', () => {
    expect(neutralizarFormula('=SUMA(A1)')).toBe("'=SUMA(A1)");
    expect(neutralizarFormula('@cmd')).toBe("'@cmd");
    expect(neutralizarFormula('Normal')).toBe('Normal');
    expect(neutralizarFormula(-5)).toBe(-5);
  });

  it('el nombre del archivo lleva la fecha local', () => {
    expect(nombreArchivo('sivcr-siniestros', 'csv', new Date(2026, 10, 8))).toBe('sivcr-siniestros-2026-11-08.csv');
  });
});

describe('Resumen de filtros', () => {
  it('sin filtros no hay frases', () => {
    expect(resumirFiltros(filtrosVacios())).toEqual([]);
  });

  it('describe cada filtro activo', () => {
    const f = { ...filtrosVacios(), provincia: 'Limón', meses: [3, 1], anios: [2025 as const, 2024 as const] };
    expect(resumirFiltros(f)).toEqual(['Provincia: Limón', 'Año: 2024, 2025', 'Mes: Enero, Marzo']);
  });
});
