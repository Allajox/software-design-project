import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { CriteriosApi, PaginaApi, SiniestroApi } from './modelos-api';

/** Campos por los que el backend permite ordenar (FilterManager.COLUMNAS_ORDEN). */
export const CAMPOS_ORDENABLES = ['anio', 'mes', 'provincia', 'canton', 'distrito', 'ruta', 'severidad', 'clima', 'calzada'] as const;
export type CampoOrden = (typeof CAMPOS_ORDENABLES)[number];

export interface OrdenApi {
  campo: CampoOrden;
  direccion: 'asc' | 'desc';
}

/** Tamaño de página máximo que acepta el backend; si se pide más, lo recorta. */
export const TAMANO_MAXIMO_PAGINA = 200;

/** Texto del parámetro `sort` ("campo" o "campo:desc"); undefined = orden por defecto del servidor (año, mes). */
export function parametroOrden(orden: OrdenApi | null): string | undefined {
  return orden ? (orden.direccion === 'desc' ? `${orden.campo}:desc` : orden.campo) : undefined;
}

/**
 * POST /api/records/search (ADMIN y ANALISTA). `pagina` empieza en 0.
 * Pedir la página 0 hace que el SERVIDOR anote la consulta en el historial del usuario: el frontend no la anota.
 */
@Injectable({ providedIn: 'root' })
export class RegistrosApiService {
  private readonly http = inject(HttpClient);

  buscar(criterios: CriteriosApi, pagina: number, tamano: number, orden: OrdenApi | null): Observable<PaginaApi<SiniestroApi>> {
    let params = new HttpParams().set('page', pagina).set('size', Math.min(tamano, TAMANO_MAXIMO_PAGINA));
    const sort = parametroOrden(orden);
    if (sort) params = params.set('sort', sort);
    return this.http.post<PaginaApi<SiniestroApi>>(`${API_CONFIG.baseUrl}/records/search`, criterios, { params });
  }
}
