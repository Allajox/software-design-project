import { Injectable, computed, inject } from '@angular/core';
import { DIAS, EDADES, FRANJAS, PROVINCIAS, RUTAS, SEVERIDADES, VEHICULOS } from '../models/catalogos';
import { CLAVES_UBICACION, Siniestro } from '../models/siniestro.models';
import { DatosVialesService } from './datos-viales.service';
import { FiltrosService } from './filtros.service';
import { aplicarFiltros } from './filtrado';
import { calcularKpis, calcularTFv, calcularTSV } from './kpi.calculator';

/** Un valor agrupado listo para graficar (sin formato de texto: eso es cosa de la vista) */
export interface ItemConteo {
  etiqueta: string;
  valor: number;
  /** Porcentaje sobre el total de su grupo, 0-100 */
  porcentaje: number;
}

export interface ItemVehiculo extends ItemConteo {
  /** Tasa de fatalidad del tipo de vehículo (TFv) */
  tasaFatalidad: number;
}

export interface ItemRuta extends ItemConteo {
  /** Porcentaje acumulado hasta esta ruta (ordenadas de mayor a menor) */
  acumulado: number;
}

export interface MatrizDiaFranja {
  dias: readonly string[];
  franjas: readonly string[];
  /** valores[dia][franja] */
  valores: number[][];
  maximo: number;
}

export interface PerfilDemografico {
  edades: string[];
  masculino: number[];
  femenino: number[];
}

function contar<T>(registros: readonly Siniestro[], clave: (s: Siniestro) => T): Map<T, number> {
  const mapa = new Map<T, number>();
  for (const s of registros) mapa.set(clave(s), (mapa.get(clave(s)) ?? 0) + 1);
  return mapa;
}

/**
 * Capa de NEGOCIO: convierte los siniestros + los filtros en indicadores y agrupaciones.
 * Todo son `computed`: al cambiar un filtro se recalcula solo lo necesario, y todos los
 * gráficos y tarjetas ven la misma selección, así los números siempre coinciden.
 */
@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private readonly datos = inject(DatosVialesService);
  private readonly filtrosSrv = inject(FiltrosService);

  private readonly todos = this.datos.siniestros;
  private readonly f = this.filtrosSrv.filtros;

  /** Siniestros que cumplen TODOS los filtros */
  readonly filtrados = computed(() => aplicarFiltros(this.todos(), this.f()));

  /** "Total nacional": el país entero bajo los filtros no geográficos */
  private readonly nacional = computed(() => aplicarFiltros(this.todos(), this.f(), CLAVES_UBICACION));

  readonly totalRegistros = computed(() => this.todos().length);

  readonly kpis = computed(() =>
    calcularKpis(this.filtrados(), this.nacional().length, this.totalRegistros()),
  );

  /** Ranking de provincias con su TSV. No aplica los filtros geográficos para mostrar siempre las 7. */
  readonly porProvincia = computed<ItemConteo[]>(() => {
    const base = this.nacional();
    const conteo = contar(base, (s) => s.provincia);
    return PROVINCIAS.map((p) => {
      const valor = conteo.get(p) ?? 0;
      return { etiqueta: p, valor, porcentaje: calcularTSV(valor, base.length) };
    }).sort((a, b) => b.valor - a.valor);
  });

  /** Siniestros por tipo de vehículo, con su tasa de fatalidad. No aplica el filtro de vehículo. */
  readonly porVehiculo = computed<ItemVehiculo[]>(() => {
    const base = aplicarFiltros(this.todos(), this.f(), ['vehiculos']);
    const conteo = contar(base, (s) => s.vehiculo);
    return VEHICULOS.map((v) => {
      const valor = conteo.get(v) ?? 0;
      return {
        etiqueta: v,
        valor,
        porcentaje: calcularTSV(valor, base.length),
        tasaFatalidad: calcularTFv(base, v),
      };
    }).sort((a, b) => b.valor - a.valor);
  });

  /** Siniestros por gravedad. No aplica el filtro de severidad. */
  readonly porSeveridad = computed<ItemConteo[]>(() => {
    const base = aplicarFiltros(this.todos(), this.f(), ['severidades']);
    const conteo = contar(base, (s) => s.severidad);
    return SEVERIDADES.map((sev) => {
      const valor = conteo.get(sev) ?? 0;
      return { etiqueta: sev, valor, porcentaje: calcularTSV(valor, base.length) };
    });
  });

  /** Rutas con más siniestros (mayor a menor) y porcentaje acumulado. No aplica el filtro de ruta. */
  readonly rutasPrincipales = computed<ItemRuta[]>(() => {
    const base = aplicarFiltros(this.todos(), this.f(), ['ruta']);
    const conteo = contar(base, (s) => s.ruta);
    let acumulado = 0;
    return RUTAS.map((r) => ({ etiqueta: r as string, valor: conteo.get(r) ?? 0 }))
      .filter((r) => r.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
      .map((r) => {
        acumulado += r.valor;
        return {
          etiqueta: r.etiqueta,
          valor: r.valor,
          porcentaje: calcularTSV(r.valor, base.length),
          acumulado: calcularTSV(acumulado, base.length),
        };
      });
  });

  /** Matriz día de la semana × franja horaria */
  readonly matrizDiaFranja = computed<MatrizDiaFranja>(() => {
    const valores = DIAS.map(() => FRANJAS.map(() => 0));
    for (const s of this.filtrados()) {
      valores[DIAS.indexOf(s.diaSemana)][FRANJAS.indexOf(s.franja)]++;
    }
    return { dias: DIAS, franjas: FRANJAS, valores, maximo: Math.max(0, ...valores.flat()) };
  });

  /** Personas involucradas por rango de edad y género (de mayor a menor edad, como pirámide) */
  readonly perfilDemografico = computed<PerfilDemografico>(() => {
    const edades = [...EDADES].reverse();
    const masculino = edades.map(() => 0);
    const femenino = edades.map(() => 0);
    for (const s of this.filtrados()) {
      const i = edades.indexOf(s.edad);
      if (s.genero === 'Masculino') masculino[i]++;
      else femenino[i]++;
    }
    return { edades, masculino, femenino };
  });
}
