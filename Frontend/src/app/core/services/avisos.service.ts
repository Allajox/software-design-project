import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

/** Mensajes breves ("Consulta guardada", "No se pudo exportar") que se muestran y desaparecen solos */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private siguienteId = 1;
  private readonly _avisos = signal<readonly Aviso[]>([]);
  readonly avisos = this._avisos.asReadonly();

  exito(texto: string): void { this.mostrar('exito', texto, 4000); }
  info(texto: string): void { this.mostrar('info', texto, 4000); }
  /** Los errores duran más porque suelen pedir que la persona haga algo */
  error(texto: string): void { this.mostrar('error', texto, 8000); }

  cerrar(id: number): void {
    this._avisos.update((lista) => lista.filter((a) => a.id !== id));
  }

  private mostrar(tipo: TipoAviso, texto: string, duracionMs: number): void {
    const id = this.siguienteId++;
    this._avisos.update((lista) => [...lista.slice(-3), { id, tipo, texto }]);
    setTimeout(() => this.cerrar(id), duracionMs);
  }
}
