import {
  CAMPOS_FILTRO_PANEL, FiltrosPanel, aParametrosPanel, contarActivosPanel, filtrosPanelVacios, resumirFiltrosPanel,
} from './filtros-panel';

const con = (cambios: Partial<FiltrosPanel>): FiltrosPanel => ({ ...filtrosPanelVacios(), ...cambios });

describe('filtros del panel de indicadores (selección única)', () => {
  it('son 13 filtros y empiezan todos en «Todos» (texto vacío)', () => {
    expect(CAMPOS_FILTRO_PANEL).toHaveLength(13);
    expect(Object.values(filtrosPanelVacios()).every((v) => v === '')).toBe(true);
    expect(contarActivosPanel(filtrosPanelVacios())).toBe(0);
  });

  it('cuenta solo los filtros con una opción elegida', () => {
    expect(contarActivosPanel(con({ provincia: 'Limón', mes: '3' }))).toBe(2);
  });

  it('sin filtros no envía ningún parámetro', () => {
    expect(aParametrosPanel(filtrosPanelVacios())).toEqual({});
  });

  it('envía cada filtro con una sola opción: textos sueltos y listas de un valor', () => {
    const p = aParametrosPanel(con({
      provincia: 'San José', canton: 'Escazú', distrito: 'San Rafael', ruta: 'Ruta 27',
      anio: '2024', mes: '3', dia: 'Miércoles', franja: 'Mañana', vehiculo: 'Pick up',
      clima: 'Lluvia', calzada: 'Huecos', edad: '>60', genero: 'Femenino',
    }));
    expect(p).toEqual({
      provincia: 'San José', canton: 'Escazú', distrito: 'San Rafael', ruta: 'Ruta 27',
      anios: ['2024'], meses: ['3'], dias: ['Miércoles'], franjas: ['Mañana'], vehiculos: ['Pick up'],
      climas: ['Lluvia'], calzadas: ['Huecos'], edades: ['>60'], generos: ['Femenino'],
    });
  });

  it('no manda severidad: el panel de Figma no la tiene como filtro', () => {
    expect(Object.keys(aParametrosPanel(con({ provincia: 'Limón' })))).not.toContain('severidades');
  });

  it('resume los filtros en frases con el nombre del mes', () => {
    expect(resumirFiltrosPanel(con({ provincia: 'Limón', mes: '1', edad: '18-25' }))).toEqual([
      'Provincia: Limón', 'Mes: Enero', 'Edad: 18-25',
    ]);
    expect(resumirFiltrosPanel(filtrosPanelVacios())).toEqual([]);
  });
});
