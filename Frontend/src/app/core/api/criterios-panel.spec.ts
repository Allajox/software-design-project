import { FiltrosPanel, filtrosPanelVacios } from '../models/filtros-panel';
import { aCriteriosDelPanel, claveApi } from './criterios-panel';

const con = (cambios: Partial<FiltrosPanel>): FiltrosPanel => ({ ...filtrosPanelVacios(), ...cambios });

describe('filtros del panel → criterios que guarda el servidor', () => {
  it('traduce las etiquetas a los nombres del servidor', () => {
    expect(claveApi('San José')).toBe('SAN_JOSE');
    expect(claveApi('Limón')).toBe('LIMON');
    expect(claveApi('Mañana')).toBe('MANANA');
    expect(claveApi('Miércoles')).toBe('MIERCOLES');
    expect(claveApi('Lluvia con neblina')).toBe('LLUVIA_CON_NEBLINA');
    expect(claveApi('Construcción o reparación')).toBe('CONSTRUCCION_O_REPARACION');
  });

  it('sin filtros no guarda nada', () => {
    expect(aCriteriosDelPanel(filtrosPanelVacios())).toEqual({});
  });

  it('guarda ubicación, tiempo, clima y calzada', () => {
    expect(aCriteriosDelPanel(con({
      provincia: 'Heredia', canton: 'Barva', distrito: 'San Pedro', ruta: 'Ruta 3', anio: '2024', mes: '7',
      dia: 'Sábado', franja: 'Noche', clima: 'Neblina', calzada: 'Resbaladiza',
    }))).toEqual({
      provincia: 'HEREDIA', canton: 'Barva', distrito: 'San Pedro', ruta: '3', anio: 2024, mes: 7,
      diaSemana: 'SABADO', franja: 'NOCHE', clima: 'NEBLINA', calzada: 'RESBALADIZA',
    });
  });

  it('el rango de edad pasa a edadMin y edadMax; «>60» no tiene máximo', () => {
    expect(aCriteriosDelPanel(con({ edad: '26-40' }))).toEqual({ edadMin: 26, edadMax: 40 });
    expect(aCriteriosDelPanel(con({ edad: '>60' }))).toEqual({ edadMin: 61 });
  });

  it('el género se guarda con el nombre del servidor', () => {
    expect(aCriteriosDelPanel(con({ genero: 'Femenino' }))).toEqual({ genero: 'FEMENINO' });
  });

  it('el tipo de vehículo no se guarda (el servidor no entiende los tipos de COSEVI)', () => {
    expect(aCriteriosDelPanel(con({ vehiculo: 'Motocicleta' }))).toEqual({});
  });
});
