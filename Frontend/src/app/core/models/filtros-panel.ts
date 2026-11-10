import { MESES } from './catalogos';

/**
 * Filtros del panel de indicadores (Figma «Panel de indicadores»). Cada filtro admite UNA sola opción: texto vacío
 * significa «Todos». Los textos son las etiquetas que entiende GET /api/dashboard ("San José", "Mañana", "Ruta 27").
 *
 * Es un modelo aparte del de Registros, Hotspots e Historial (`Filtros`, de selección múltiple): esas pantallas siguen
 * como estaban.
 */
export interface FiltrosPanel {
  provincia: string;
  canton: string;
  distrito: string;
  /** «Ruta 27» */
  ruta: string;
  /** Año como texto («2024») */
  anio: string;
  /** Número del mes como texto («1» a «12») */
  mes: string;
  dia: string;
  franja: string;
  vehiculo: string;
  clima: string;
  calzada: string;
  /** Rango de edad: «18-25», «26-40», «41-60» o «>60» */
  edad: string;
  genero: string;
}

export type CampoFiltroPanel = keyof FiltrosPanel;

/** Los filtros en el orden en que se muestran (7 en la primera fila, 6 en la segunda) y el nombre de cada uno. */
export const CAMPOS_FILTRO_PANEL: readonly { clave: CampoFiltroPanel; etiqueta: string }[] = [
  { clave: 'provincia', etiqueta: 'Provincia' },
  { clave: 'canton', etiqueta: 'Cantón' },
  { clave: 'distrito', etiqueta: 'Distrito' },
  { clave: 'ruta', etiqueta: 'Ruta' },
  { clave: 'anio', etiqueta: 'Año' },
  { clave: 'mes', etiqueta: 'Mes' },
  { clave: 'dia', etiqueta: 'Día' },
  { clave: 'franja', etiqueta: 'Franja' },
  { clave: 'vehiculo', etiqueta: 'Vehículo' },
  { clave: 'clima', etiqueta: 'Clima' },
  { clave: 'calzada', etiqueta: 'Calzada' },
  { clave: 'edad', etiqueta: 'Edad' },
  { clave: 'genero', etiqueta: 'Género' },
];

export function filtrosPanelVacios(): FiltrosPanel {
  return {
    provincia: '', canton: '', distrito: '', ruta: '', anio: '', mes: '', dia: '', franja: '',
    vehiculo: '', clima: '', calzada: '', edad: '', genero: '',
  };
}

/** Cuántos filtros tienen una opción elegida */
export function contarActivosPanel(f: FiltrosPanel): number {
  return CAMPOS_FILTRO_PANEL.filter((c) => f[c.clave] !== '').length;
}

/**
 * Parámetros de GET /api/dashboard y GET /api/dashboard/export. El servidor recibe listas para los filtros que
 * admiten varios valores; aquí cada una lleva a lo sumo uno (?anios=2024). Lo que está en «Todos» no se envía.
 */
export function aParametrosPanel(f: FiltrosPanel): Record<string, string | string[]> {
  const p: Record<string, string | string[]> = {};
  const texto = (clave: string, valor: string): void => {
    if (valor) p[clave] = valor;
  };
  const lista = (clave: string, valor: string): void => {
    if (valor) p[clave] = [valor];
  };
  texto('provincia', f.provincia);
  texto('canton', f.canton);
  texto('distrito', f.distrito);
  texto('ruta', f.ruta);
  lista('anios', f.anio);
  lista('meses', f.mes);
  lista('dias', f.dia);
  lista('franjas', f.franja);
  lista('vehiculos', f.vehiculo);
  lista('climas', f.clima);
  lista('calzadas', f.calzada);
  lista('edades', f.edad);
  lista('generos', f.genero);
  return p;
}

/** Frases cortas con los filtros elegidos («Provincia: Limón», «Mes: Enero»), para el cuadro de guardar. */
export function resumirFiltrosPanel(f: FiltrosPanel): string[] {
  return CAMPOS_FILTRO_PANEL.filter((c) => f[c.clave] !== '').map((c) => {
    const valor = c.clave === 'mes' ? (MESES[Number(f.mes) - 1] ?? f.mes) : f[c.clave];
    return `${c.etiqueta}: ${valor}`;
  });
}

/** Filtros que solo afectan a los siniestros (las personas de COSEVI no se pueden enlazar con su siniestro). */
export const FILTROS_SOLO_SINIESTROS: readonly CampoFiltroPanel[] = ['ruta', 'franja', 'clima', 'calzada'];
/** Filtros que solo afectan a las personas. */
export const FILTROS_SOLO_PERSONAS: readonly CampoFiltroPanel[] = ['vehiculo', 'edad', 'genero'];
