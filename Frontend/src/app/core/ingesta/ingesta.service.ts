import { Injectable, inject, signal } from '@angular/core';
import { DatosVialesService } from '../services/datos-viales.service';
import {
  ErrorLectura, MAX_BYTES, TablaCruda, decodificarTexto, detectarFormato, parsearCsv, parsearJson, tablaDesdeMatriz,
} from './lector';
import { ResultadoIngesta, validarTabla } from './validacion';

export type ModoImportacion = 'agregar' | 'reemplazar';

export type FaseIngesta =
  | 'inicio'      // esperando un archivo
  | 'procesando'  // leyendo y validando
  | 'revision'    // el reporte de calidad está listo
  | 'importado';  // los datos ya se cargaron

export interface ArchivoCargado {
  nombre: string;
  bytes: number;
  codificacion?: string;
}

export interface ImportacionHecha {
  agregados: number;
  modo: ModoImportacion;
  archivo: string;
}

/** Deja respirar al navegador para que alcance a pintar "Validando…" antes de un cálculo largo */
const respirar = () => new Promise<void>((r) => setTimeout(r, 30));

/**
 * Orquesta la carga de datos (RF-1): lee el archivo, lo valida y, si la persona confirma,
 * lo entrega a DatosVialesService. Las reglas viven en funciones puras (ver /core/ingesta);
 * este servicio solo maneja el estado de la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class IngestaService {
  private readonly datos = inject(DatosVialesService);

  readonly fase = signal<FaseIngesta>('inicio');
  readonly archivo = signal<ArchivoCargado | null>(null);
  readonly resultado = signal<ResultadoIngesta | null>(null);
  readonly cabeceras = signal<readonly string[]>([]);
  /** Error que impide leer el archivo completo (formato, tamaño, JSON roto…) */
  readonly error = signal<string | null>(null);
  readonly modo = signal<ModoImportacion>('agregar');
  readonly importacion = signal<ImportacionHecha | null>(null);

  private tabla: TablaCruda | null = null;
  /** Evita que un archivo lento pise a uno más reciente */
  private turno = 0;

  async cargar(file: File): Promise<void> {
    const miTurno = ++this.turno;
    this.reiniciarEstado();
    this.fase.set('procesando');
    this.archivo.set({ nombre: file.name, bytes: file.size });

    try {
      this.tabla = await this.leer(file);
      if (miTurno !== this.turno) return;
      this.cabeceras.set(this.tabla.cabeceras);
      await respirar();
      if (miTurno !== this.turno) return;
      this.resultado.set(this.validar('agregar'));
      this.fase.set('revision');
    } catch (e) {
      if (miTurno !== this.turno) return;
      this.tabla = null;
      this.error.set(e instanceof ErrorLectura ? e.message : 'No se pudo leer el archivo. Verifique que no esté dañado e intente de nuevo.');
      this.fase.set('inicio');
    }
  }

  /** Cambia entre agregar y reemplazar: con «reemplazar» los datos actuales ya no cuentan para detectar duplicados */
  async cambiarModo(modo: ModoImportacion): Promise<void> {
    if (!this.tabla || modo === this.modo()) return;
    const miTurno = ++this.turno;
    this.modo.set(modo);
    this.fase.set('procesando');
    await respirar();
    if (miTurno !== this.turno) return;
    this.resultado.set(this.validar(modo));
    this.fase.set('revision');
  }

  /** Entrega los registros válidos a la capa de datos. @returns cuántos se importaron */
  importar(): number {
    const r = this.resultado();
    const arch = this.archivo();
    if (this.fase() !== 'revision' || !r || !arch || !r.puedeImportar) return 0;
    const modo = this.modo();
    const n = modo === 'reemplazar' ? this.datos.reemplazar(r.registros, arch.nombre) : this.datos.agregar(r.registros, arch.nombre);
    this.tabla = null;
    this.resultado.set(null);
    this.importacion.set({ agregados: n, modo, archivo: arch.nombre });
    this.fase.set('importado');
    return n;
  }

  /** Descarta el archivo actual y vuelve al inicio */
  reiniciar(): void {
    this.turno++;
    this.tabla = null;
    this.reiniciarEstado();
    this.archivo.set(null);
    this.fase.set('inicio');
  }

  private reiniciarEstado(): void {
    this.error.set(null);
    this.resultado.set(null);
    this.cabeceras.set([]);
    this.importacion.set(null);
    this.modo.set('agregar');
  }

  private validar(modo: ModoImportacion): ResultadoIngesta {
    return validarTabla(this.tabla!, { existentes: modo === 'agregar' ? this.datos.siniestros() : [] });
  }

  private async leer(file: File): Promise<TablaCruda> {
    const formato = detectarFormato(file.name);
    if (formato === null) {
      throw new ErrorLectura(`«${file.name}» no es un formato admitido. Use CSV, JSON, GeoJSON o Excel (.xlsx).`);
    }
    if (formato === 'xls') {
      throw new ErrorLectura('Los archivos .xls (Excel antiguo) no se pueden leer. En Excel use «Guardar como» y elija «Libro de Excel (.xlsx)» o «CSV».');
    }
    if (file.size === 0) throw new ErrorLectura('El archivo está vacío.');
    if (file.size > MAX_BYTES) {
      throw new ErrorLectura(`El archivo pesa más de ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Divídalo en varios archivos más pequeños.`);
    }

    if (formato === 'excel') {
      try {
        const { readSheet } = await import('read-excel-file/universal');
        const matriz = await readSheet(file);
        this.archivo.update((a) => a && { ...a, codificacion: 'Excel (.xlsx), primera hoja' });
        return tablaDesdeMatriz(matriz, 'excel');
      } catch (e) {
        if (e instanceof ErrorLectura) throw e;
        throw new ErrorLectura('No se pudo leer el Excel. Verifique que sea un .xlsx válido, sin contraseña y que los datos estén en la primera hoja.');
      }
    }

    const { texto, codificacion } = decodificarTexto(new Uint8Array(await file.arrayBuffer()));
    this.archivo.update((a) => a && { ...a, codificacion });
    return formato === 'csv' ? parsearCsv(texto) : parsearJson(texto);
  }
}
