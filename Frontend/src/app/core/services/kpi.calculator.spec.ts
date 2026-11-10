import { Siniestro } from '../models/siniestro.models';
import { filtrosVacios } from '../models/siniestro.models';
import { generarSiniestros } from '../data/generador-siniestros';
import { aplicarFiltros, contarFiltrosActivos } from './filtrado';
import { calcularIC, calcularISS, calcularKpis, calcularTFv, calcularTPR, calcularTSV } from './kpi.calculator';

/** Siniestro de prueba con valores por defecto, para cambiar solo lo que importa en cada caso */
function siniestro(parcial: Partial<Siniestro> = {}): Siniestro {
  return {
    id: 1,
    fecha: '2025-01-01',
    anio: 2025,
    mes: 1,
    diaSemana: 'Miércoles',
    franja: 'Mañana',
    provincia: 'San José',
    canton: 'San José',
    distrito: 'Carmen',
    ruta: 'Ruta 1',
    kilometro: 10,
    vehiculo: 'Automóvil',
    severidad: 'Solo heridos leves',
    fallecidos: 0,
    heridosGraves: 0,
    heridosLeves: 1,
    clima: 'Buen tiempo',
    calzada: 'Buena',
    senalizacion: true,
    edad: '26-40',
    genero: 'Masculino',
    condicion: 'Conductor',
    tiempoRespuestaMin: 10,
    ...parcial,
  };
}

describe('Fórmulas de KPIs (sección 3.4 del documento)', () => {
  it('TSV: porcentaje de la región sobre el total nacional', () => {
    expect(calcularTSV(25, 200)).toBe(12.5);
    expect(calcularTSV(0, 0)).toBe(0); // sin datos no divide entre cero
  });

  it('ISS: (W1·fallecidos + W2·graves + W3·leves) / total de incidencias', () => {
    const datos = [
      siniestro({ fallecidos: 1, heridosGraves: 0, heridosLeves: 0 }),
      siniestro({ fallecidos: 0, heridosGraves: 2, heridosLeves: 1 }),
    ];
    // pesos 10, 5, 1 -> (10·1 + 5·2 + 1·1) / 2 = 10,5
    expect(calcularISS(datos)).toBe(10.5);
    expect(calcularISS([])).toBe(0);
  });

  it('TPR: promedio de minutos de respuesta', () => {
    const datos = [siniestro({ tiempoRespuestaMin: 10 }), siniestro({ tiempoRespuestaMin: 30 })];
    expect(calcularTPR(datos)).toBe(20);
  });

  it('TFv: % de siniestros de un tipo de vehículo con al menos un fallecido', () => {
    const datos = [
      siniestro({ vehiculo: 'Motocicleta', fallecidos: 1 }),
      siniestro({ vehiculo: 'Motocicleta', fallecidos: 0 }),
      siniestro({ vehiculo: 'Motocicleta', fallecidos: 0 }),
      siniestro({ vehiculo: 'Motocicleta', fallecidos: 2 }),
      siniestro({ vehiculo: 'Automóvil', fallecidos: 1 }),
    ];
    expect(calcularTFv(datos, 'Motocicleta')).toBe(50); // 2 de 4
    expect(calcularTFv(datos, 'Bicicleta')).toBe(0); // no hay bicicletas
  });

  it('IC: % bajo condiciones adversas (clima adverso o calzada adversa)', () => {
    const datos = [
      siniestro({ clima: 'Lluvia' }),
      siniestro({ clima: 'Buen tiempo', calzada: 'Resbaladiza' }),
      siniestro({ clima: 'Buen tiempo' }),
      siniestro({ clima: 'Neblina' }),
    ];

    expect(calcularIC(datos)).toBe(75);
  });

  it('calcularKpis suma víctimas y usa el total nacional como denominador del TSV', () => {
    const datos = [siniestro({ fallecidos: 1, heridosGraves: 1, heridosLeves: 2 })];
    const k = calcularKpis(datos, 10, 100);
    expect(k.victimas).toBe(4);
    expect(k.tsv).toBe(10);
    expect(k.totalRegistros).toBe(100);
  });
});

describe('Filtros multidimensionales (RF-2)', () => {
  const datos = generarSiniestros(2000, 7);

  it('sin filtros devuelve todos los registros', () => {
    expect(aplicarFiltros(datos, filtrosVacios()).length).toBe(datos.length);
  });

  it('un filtro de lista deja solo las opciones elegidas', () => {
    const f = { ...filtrosVacios(), franjas: ['Madrugada' as const] };
    const r = aplicarFiltros(datos, f);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.franja === 'Madrugada')).toBe(true);
  });

  it('los filtros se combinan (cruzados)', () => {
    const f = { ...filtrosVacios(), provincia: 'Limón', vehiculos: ['Motocicleta' as const], anios: [2024 as const] };
    const r = aplicarFiltros(datos, f);
    expect(r.every((s) => s.provincia === 'Limón' && s.vehiculo === 'Motocicleta' && s.anio === 2024)).toBe(true);
    expect(r.length).toBeLessThan(aplicarFiltros(datos, { ...filtrosVacios(), provincia: 'Limón' }).length);
  });

  it('"ignorar" excluye un filtro del cálculo', () => {
    const f = { ...filtrosVacios(), provincia: 'Limón' };
    expect(aplicarFiltros(datos, f, ['provincia']).length).toBe(datos.length);
  });

  it('cuenta los filtros activos por grupo, no por opción', () => {
    const f = { ...filtrosVacios(), provincia: 'Cartago', meses: [1, 2, 3] };
    expect(contarFiltrosActivos(f)).toBe(2);
  });
});

describe('Datos de ejemplo', () => {
  it('son deterministas: la misma semilla da los mismos registros', () => {
    expect(generarSiniestros(50, 1)).toEqual(generarSiniestros(50, 1));
  });

  it('son coherentes: la gravedad coincide con las víctimas', () => {
    for (const s of generarSiniestros(1500, 3)) {
      if (s.severidad === 'Fallecido') expect(s.fallecidos).toBeGreaterThan(0);
      if (s.severidad === 'Con muertos o graves') expect(s.fallecidos === 0 && s.heridosGraves > 0).toBe(true);
      if (s.severidad === 'Solo heridos leves') expect(s.fallecidos + s.heridosGraves).toBe(0);
    }
  });
});