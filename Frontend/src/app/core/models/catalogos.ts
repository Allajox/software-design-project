/**
 * Catálogos del dominio vial (variables de la sección 3.1 del documento del SIVCR).
 * Cada catálogo es una lista fija; el tipo se deriva de la propia lista para que
 * TypeScript marque error si se usa un valor que no existe.
 */

// ---------- Geográficos / administrativos ----------
export const PROVINCIAS = [
  'San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón',
] as const;
export type Provincia = (typeof PROVINCIAS)[number];

/** Provincia → Cantón → Distritos (muestra representativa, no el catálogo oficial completo) */
export const UBICACIONES: Record<Provincia, Record<string, string[]>> = {
  'San José': {
    'San José': ['Carmen', 'Merced', 'Hospital', 'Catedral', 'Zapote', 'Pavas', 'Hatillo', 'Uruca'],
    'Escazú': ['Escazú', 'San Antonio', 'San Rafael'],
    'Desamparados': ['Desamparados', 'San Miguel', 'San Rafael Arriba'],
    'Goicoechea': ['Guadalupe', 'Ipís', 'Calle Blancos'],
    'Alajuelita': ['Alajuelita', 'San Josecito'],
  },
  'Alajuela': {
    'Alajuela': ['Alajuela', 'San José', 'Río Segundo', 'Turrúcares'],
    'San Carlos': ['Quesada', 'Florencia', 'Pital'],
    'Grecia': ['Grecia', 'San Isidro', 'Tacares'],
    'San Ramón': ['San Ramón', 'Santiago', 'Piedades Norte'],
    'Naranjo': ['Naranjo', 'San Miguel'],
  },
  'Cartago': {
    'Cartago': ['Oriental', 'Occidental', 'Guadalupe', 'San Nicolás'],
    'Paraíso': ['Paraíso', 'Orosi', 'Cachí'],
    'La Unión': ['Tres Ríos', 'San Diego', 'San Juan'],
    'Turrialba': ['Turrialba', 'La Suiza'],
    'Oreamuno': ['San Rafael', 'Cot'],
  },
  'Heredia': {
    'Heredia': ['Heredia', 'Mercedes', 'San Francisco', 'Ulloa'],
    'Barva': ['Barva', 'San Pedro'],
    'Santo Domingo': ['Santo Domingo', 'Santo Tomás'],
    'San Rafael': ['San Rafael', 'Ángeles'],
    'Belén': ['San Antonio', 'La Ribera'],
  },
  'Guanacaste': {
    'Liberia': ['Liberia', 'Cañas Dulces', 'Nacascolo'],
    'Santa Cruz': ['Santa Cruz', 'Bolsón', 'Cuajiniquil'],
    'Nicoya': ['Nicoya', 'Mansión', 'San Antonio'],
    'Carrillo': ['Filadelfia', 'Palmira', 'Sardinal'],
    'Cañas': ['Cañas', 'Palmira'],
  },
  'Puntarenas': {
    'Puntarenas': ['Puntarenas', 'Pitahaya', 'Chomes'],
    'Esparza': ['Espíritu Santo', 'San Juan Grande'],
    'Garabito': ['Jacó', 'Tárcoles'],
    'Quepos': ['Quepos', 'Savegre'],
    'Golfito': ['Golfito', 'Puerto Jiménez'],
  },
  'Limón': {
    'Limón': ['Limón', 'Valle La Estrella', 'Río Blanco'],
    'Pococí': ['Guápiles', 'Jiménez', 'Rita'],
    'Siquirres': ['Siquirres', 'Pacuarito'],
    'Talamanca': ['Bratsi', 'Sixaola'],
    'Matina': ['Matina', 'Batán'],
  },
};

export const RUTAS = [
  'Ruta 1', 'Ruta 2', 'Ruta 3', 'Ruta 4', 'Ruta 5', 'Ruta 10', 'Ruta 17', 'Ruta 18',
  'Ruta 21', 'Ruta 23', 'Ruta 27', 'Ruta 32', 'Ruta 34', 'Ruta 35', 'Ruta 36', 'Ruta 39',
] as const;
export type Ruta = (typeof RUTAS)[number];

// ---------- Temporales ----------
export const ANIOS = [2023, 2024, 2025] as const;
export type Anio = (typeof ANIOS)[number];

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export type DiaSemana = (typeof DIAS)[number];

export const FRANJAS = ['Madrugada', 'Mañana', 'Tarde', 'Noche'] as const;
export type FranjaHoraria = (typeof FRANJAS)[number];

// ---------- Vehiculares ----------
export const VEHICULOS = [
  'Motocicleta', 'Automóvil', 'Pick up', 'Bicicleta', 'Rural', 'Autobús', 'Taxi', 'Microbús',
  'Camión', 'Cabezal con remolque', 'Cabezal sin remolque', 'Vagoneta', 'Cisterna', 'Grúa',
  'Ambulancia', 'Vehículo con remolque', 'Otros',
] as const;
export type TipoVehiculo = (typeof VEHICULOS)[number];

// ---------- Gravedad ----------
export const SEVERIDADES = [
  'Fallecido',
  'Con muertos o graves',
  'Solo heridos leves',
] as const;
export type Severidad = (typeof SEVERIDADES)[number];

// ---------- Entorno ----------
export const CLIMAS = ['Buen tiempo', 'Lluvia', 'Neblina', 'Lluvia con neblina'] as const;
export type Clima = (typeof CLIMAS)[number];

export const CALZADAS = ['Buena', 'Huecos', 'Resbaladiza', 'Construcción o reparación', 'Hundimientos', 'Otros'] as const;
export type EstadoCalzada = (typeof CALZADAS)[number];

/** Climas que cuentan como "condición adversa" (CA) en el índice IC (3.4.5) */
export const CLIMAS_ADVERSOS: readonly Clima[] = ['Lluvia', 'Neblina', 'Lluvia con neblina'];
/** Estados de calzada que también cuentan como condición adversa */
export const CALZADAS_ADVERSAS: readonly EstadoCalzada[] = ['Huecos', 'Resbaladiza', 'Hundimientos'];

// ---------- Demográficos ----------
export const EDADES = ['18-25', '26-40', '41-60', '>60'] as const;
export type RangoEdad = (typeof EDADES)[number];

export const GENEROS = ['Masculino', 'Femenino'] as const;
export type Genero = (typeof GENEROS)[number];

export const CONDICIONES = ['Conductor', 'Acompañante', 'Peatón'] as const;
export type CondicionPersona = (typeof CONDICIONES)[number];
