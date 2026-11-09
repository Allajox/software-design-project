import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ROLES_ANALISIS } from '../config/roles.config';
import { AlmacenConsultas, ConsultaGuardada, ConsultaReciente } from '../models/consulta.models';
import { Filtros } from '../models/siniestro.models';
import { AuthService } from './auth.service';
import { agregarReciente, claveFiltros, MAX_GUARDADAS, nuevoId, sanitizarAlmacen, validarNombreConsulta } from './consultas';
import { contarFiltrosActivos } from './filtrado';
import { FiltrosService } from './filtros.service';

/** Segundos que los filtros deben quedarse quietos para anotar la consulta en el historial */
const ESPERA_HISTORIAL_MS = 1500;

/**
 * Consultas guardadas e historial (RF-5), separados por usuario.
 * Hoy se guardan en el navegador (localStorage); cuando exista el backend, solo cambian
 * `cargar` y `persistir` por llamadas HTTP, el resto de la aplicación no se entera.
 */
@Injectable({ providedIn: 'root' })
export class ConsultasService {
  private readonly auth = inject(AuthService);
  private readonly filtrosSrv = inject(FiltrosService);

  private readonly _almacen = signal<AlmacenConsultas>({ guardadas: [], recientes: [] });
  readonly guardadas = () => this._almacen().guardadas;
  readonly recientes = () => this._almacen().recientes;

  /** ¿Este usuario puede usar el historial? (el Consultor Público no) */
  readonly habilitado = () => this.auth.tieneRol(ROLES_ANALISIS);

  constructor() {
    // Al entrar otra persona, se cargan SUS consultas
    effect(() => {
      const id = this.auth.usuario()?.id;
      untracked(() => this._almacen.set(id === undefined ? { guardadas: [], recientes: [] } : this.cargar(id)));
    });

    // Historial automático: cuando los filtros dejan de cambiar un momento, se anota la combinación
    effect((alLimpiar) => {
      const filtros = this.filtrosSrv.filtros();
      if (!this.habilitado() || contarFiltrosActivos(filtros) === 0) return;
      const temporizador = setTimeout(() => this.registrarReciente(filtros), ESPERA_HISTORIAL_MS);
      alLimpiar(() => clearTimeout(temporizador));
    });
  }

  // ----- Guardadas -----

  /** @returns un mensaje de error o null si se guardó */
  guardar(nombre: string, filtros: Filtros): string | null {
    const error = validarNombreConsulta(nombre, this.guardadas());
    if (error) return error;
    if (this.guardadas().length >= MAX_GUARDADAS) return `Solo se pueden guardar ${MAX_GUARDADAS} consultas. Elimine alguna.`;
    const nueva: ConsultaGuardada = {
      id: nuevoId(), nombre: nombre.trim(), filtros: structuredClone(filtros), creadaEn: new Date().toISOString(),
    };
    this.actualizar({ guardadas: [nueva, ...this.guardadas()] });
    return null;
  }

  renombrar(id: string, nombre: string): string | null {
    const error = validarNombreConsulta(nombre, this.guardadas(), id);
    if (error) return error;
    this.actualizar({ guardadas: this.guardadas().map((c) => (c.id === id ? { ...c, nombre: nombre.trim() } : c)) });
    return null;
  }

  eliminar(id: string): void {
    this.actualizar({ guardadas: this.guardadas().filter((c) => c.id !== id) });
  }

  // ----- Recientes -----

  registrarReciente(filtros: Filtros): void {
    if (contarFiltrosActivos(filtros) === 0) return;
    const actuales = this.recientes();
    // Si ya es la última anotada, no hace falta tocar nada
    if (actuales[0] && claveFiltros(actuales[0].filtros) === claveFiltros(filtros)) return;
    this.actualizar({ recientes: agregarReciente(actuales, structuredClone(filtros), nuevoId()) });
  }

  eliminarReciente(id: string): void {
    this.actualizar({ recientes: this.recientes().filter((r: ConsultaReciente) => r.id !== id) });
  }

  limpiarRecientes(): void {
    this.actualizar({ recientes: [] });
  }

  /** Borra del navegador las consultas guardadas de una cuenta que ya no existe */
  olvidarUsuario(idUsuario: number): void {
    try {
      localStorage.removeItem(`sivcr_consultas_${idUsuario}`);
    } catch {
      /* almacenamiento bloqueado: no hay nada que borrar */
    }
  }

  // ----- Almacenamiento -----

  private actualizar(cambios: Partial<AlmacenConsultas>): void {
    const nuevo = { ...this._almacen(), ...cambios };
    this._almacen.set(nuevo);
    this.persistir(nuevo);
  }

  private clave(): string | null {
    const id = this.auth.usuario()?.id;
    return id === undefined ? null : `sivcr_consultas_${id}`;
  }

  private cargar(idUsuario: number): AlmacenConsultas {
    try {
      const raw = localStorage.getItem(`sivcr_consultas_${idUsuario}`);
      return sanitizarAlmacen(raw ? JSON.parse(raw) : null);
    } catch {
      return { guardadas: [], recientes: [] };
    }
  }

  private persistir(almacen: AlmacenConsultas): void {
    const clave = this.clave();
    if (!clave) return;
    try {
      localStorage.setItem(clave, JSON.stringify(almacen));
    } catch {
      /* sin espacio o almacenamiento bloqueado: la sesión sigue funcionando, solo no se recuerda */
    }
  }
}
