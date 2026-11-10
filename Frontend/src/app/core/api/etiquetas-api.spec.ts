import { CLIMAS_API, MESES_API, PROVINCIAS_API, SEVERIDADES_API, etiquetaDe, resumirCriterios } from './etiquetas-api';

describe('Etiquetas de los valores del backend', () => {
  it('cubre las 7 provincias, los 12 meses y las categorías reales de COSEVI', () => {
    expect(PROVINCIAS_API).toHaveLength(7);
    expect(MESES_API).toHaveLength(12);
    expect(CLIMAS_API.map((o) => o.valor)).toEqual(['BUEN_TIEMPO', 'LLUVIA', 'NEBLINA', 'LLUVIA_CON_NEBLINA']);
    // COSEVI solo distingue dos niveles de gravedad; FALLECIDO llega de INEC
    expect(SEVERIDADES_API.map((o) => o.valor)).toEqual(['SOLO_HERIDOS_LEVES', 'CON_MUERTOS_O_GRAVES', 'FALLECIDO']);
  });

  it('traduce un valor conocido y muestra tal cual uno nuevo del servidor', () => {
    expect(etiquetaDe(PROVINCIAS_API, 'SAN_JOSE')).toBe('San José');
    expect(etiquetaDe(MESES_API, 7)).toBe('Julio');
    expect(etiquetaDe(PROVINCIAS_API, 'ISLA_DEL_COCO')).toBe('ISLA_DEL_COCO');
  });

  it('un valor ausente se muestra como raya, no como "null" ni 0', () => {
    expect(etiquetaDe(PROVINCIAS_API, null)).toBe('—');
    expect(etiquetaDe(PROVINCIAS_API, undefined)).toBe('—');
    expect(etiquetaDe(MESES_API, '')).toBe('—');
  });

  it('resume los criterios en frases legibles y omite lo que está vacío o en 0', () => {
    expect(resumirCriterios({})).toEqual([]);
    expect(resumirCriterios({ anio: 0, mes: 0, canton: '' })).toEqual([]);
    expect(
      resumirCriterios({ provincia: 'HEREDIA', anio: 2024, mes: 7, franja: 'MANANA', calzada: 'CONSTRUCCION_O_REPARACION' }),
    ).toEqual(['Provincia: Heredia', 'Año: 2024', 'Mes: Julio', 'Franja: Mañana', 'Calzada: En construcción o reparación']);
  });
});
