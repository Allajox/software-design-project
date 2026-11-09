import { Injectable, computed, signal } from '@angular/core';
import { PROVINCIAS, Provincia, UBICACIONES } from '../models/catalogos';
import { ClaveFiltroLista, Filtros, filtrosVacios } from '../models/siniestro.models';
import { contarFiltrosActivos } from './filtrado';

/**
 * Estado de los filtros del dashboard. Vive en un servicio (no en el componente)
 * para que otras pantallas —Explorador de registros, Historial de consultas— puedan
 * compartirlo o guardarlo más adelante (RF-4, RF-5).
 */
@Injectable({ providedIn: 'root' })
export class FiltrosService {
  private readonly _filtros = signal<Filtros>(filtrosVacios());

  readonly filtros = this._filtros.asReadonly();
  readonly activos = computed(() => contarFiltrosActivos(this._filtros()));

  /** Cantones de la provincia elegida (vacío si no hay provincia) */
  readonly cantones = computed(() => {
    const provincia = this._filtros().provincia;
    return esProvincia(provincia) ? Object.keys(UBICACIONES[provincia]) : [];
  });

  /** Distritos del cantón elegido (vacío si no hay cantón) */
  readonly distritos = computed(() => {
    const { provincia, canton } = this._filtros();
    return esProvincia(provincia) && canton ? (UBICACIONES[provincia][canton] ?? []) : [];
  });

  /** Cambia un filtro de valor único. Al cambiar provincia o cantón se reinician los niveles inferiores. */
  establecer<K extends keyof Filtros>(campo: K, valor: Filtros[K]): void {
    this._filtros.update((f) => {
      const nuevo = { ...f, [campo]: valor } as Filtros;
      if (campo === 'provincia') {
        nuevo.canton = '';
        nuevo.distrito = '';
      }
      if (campo === 'canton') {
        nuevo.distrito = '';
      }
      return nuevo;
    });
  }

  /** Agrega o quita una opción de un filtro de selección múltiple */
  alternar<K extends ClaveFiltroLista>(campo: K, valor: Filtros[K][number]): void {
    this._filtros.update((f) => {
      const actual = f[campo] as readonly Filtros[K][number][];
      const nuevo = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor];
      return { ...f, [campo]: nuevo } as Filtros;
    });
  }

  /** Reemplaza todos los filtros de una vez (al aplicar una consulta guardada) */
  reemplazar(nuevos: Filtros): void {
    this._filtros.set(structuredClone(nuevos));
  }

  limpiar(): void {
    this._filtros.set(filtrosVacios());
  }
}

function esProvincia(valor: string): valor is Provincia {
  return (PROVINCIAS as readonly string[]).includes(valor);
}
