import { escalaNice, posicion } from './escala';

describe('escalaNice', () => {
  it('redondea a pasos de 1, 2 o 5', () => {
    expect(escalaNice(0, 3.3, 4)).toEqual({ min: 0, max: 4, paso: 1, ticks: [0, 1, 2, 3, 4] });
    expect(escalaNice(0, 0.9, 4).ticks).toEqual([0, 0.5, 1]);
    expect(escalaNice(0, 0.9, 8).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(escalaNice(23, 41, 5)).toMatchObject({ min: 20, max: 45, paso: 5 });
  });
  it('siempre cubre el rango de los datos', () => {
    for (const [a, b] of [[0, 1], [0.13, 0.87], [17, 233], [-4, 9], [0, 2.51]]) {
      const e = escalaNice(a, b, 5);
      expect(e.min).toBeLessThanOrEqual(a);
      expect(e.max).toBeGreaterThanOrEqual(b);
      expect(e.ticks[0]).toBe(e.min);
      expect(e.ticks[e.ticks.length - 1]).toBe(e.max);
    }
  });
  it('un rango vacío o inválido no rompe', () => {
    expect(escalaNice(5, 5).max).toBeGreaterThan(5);
    expect(escalaNice(Number.NaN, 3).ticks.length).toBeGreaterThan(1);
  });
  it('posicion mapea a 0-100', () => {
    expect(posicion(5, { min: 0, max: 10 })).toBe(50);
    expect(posicion(20, { min: 20, max: 40 })).toBe(0);
  });
});
