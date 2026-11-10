import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { CargaApi, FuenteApi, ReporteCalidadApi } from './modelos-api';

/**
 * Ingesta de datos (solo ADMIN; el servidor lo verifica). La carga es SÍNCRONA: la respuesta llega cuando terminó
 * el procesamiento completo del archivo (el de COSEVI tiene unas 93 000 filas y puede tardar).
 * Una carga rechazada por su contenido (formato, columnas, duplicado) igual responde 200 con resultado FALLIDA y el
 * motivo en `mensaje`; los errores de uso (sin archivo, fuente inválida) responden 400.
 */
@Injectable({ providedIn: 'root' })
export class IngestaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_CONFIG.baseUrl}/ingestion`;

  subir(archivo: File, fuente: FuenteApi): Observable<CargaApi> {
    const datos = new FormData();
    datos.append('file', archivo, archivo.name);
    datos.append('fuente', fuente);
    return this.http.post<CargaApi>(`${this.base}/upload`, datos);
  }

  historial(): Observable<CargaApi[]> {
    return this.http.get<CargaApi[]>(`${this.base}/history`);
  }

  /** 404 si la carga no generó reporte (por ejemplo, fue rechazada antes de evaluar filas). */
  reporte(idCarga: number): Observable<ReporteCalidadApi> {
    return this.http.get<ReporteCalidadApi>(`${this.base}/${idCarga}/quality-report`);
  }
}
