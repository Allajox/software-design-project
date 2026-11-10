import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { ConsultaGuardadaApi, ConsultaHistorialApi, CriteriosApi } from './modelos-api';

/** Largo máximo del nombre de una consulta guardada (FilterManager.guardarFiltro). */
export const LARGO_MAX_NOMBRE_API = 100;

/**
 * Consultas guardadas e historial (ADMIN y ANALISTA). Son del usuario de la sesión: cada persona ve solo las suyas.
 * El backend NO ofrece todavía renombrar ni eliminar una consulta guardada, ni borrar el historial.
 */
@Injectable({ providedIn: 'root' })
export class ConsultasApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_CONFIG.baseUrl}/queries`;

  guardadas(): Observable<ConsultaGuardadaApi[]> {
    return this.http.get<ConsultaGuardadaApi[]>(`${this.base}/saved`);
  }

  /** 201 con la consulta creada; 409 si el nombre ya existe; 400 si el nombre o los criterios no son válidos. */
  guardar(nombre: string, criterios: CriteriosApi): Observable<ConsultaGuardadaApi> {
    return this.http.post<ConsultaGuardadaApi>(`${this.base}/saved`, { nombre, criterios });
  }

  historial(): Observable<ConsultaHistorialApi[]> {
    return this.http.get<ConsultaHistorialApi[]>(`${this.base}/history`);
  }
}
