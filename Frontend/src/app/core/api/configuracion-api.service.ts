import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { ConfiguracionApi } from './configuracion-api';
import { mensajeDeError } from './errores-api';

/**
 * Configuración global (HU 30): GET /api/config (ADMIN y ANALISTA) y PUT /api/config (solo ADMIN, el servidor lo verifica).
 * El PUT reemplaza TODA la configuración y los KPI del dashboard usan el cambio desde la siguiente consulta.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_CONFIG.baseUrl}/config`;

  /** La configuración que tiene el servidor (null mientras no haya llegado) */
  readonly vigente = signal<ConfiguracionApi | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.vigente.set(await firstValueFrom(this.http.get<ConfiguracionApi>(this.url)));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Guarda y deja en `vigente` lo que quedó guardado. Devuelve el motivo si el servidor la rechazó. */
  async guardar(config: ConfiguracionApi): Promise<{ ok: true; config: ConfiguracionApi } | { ok: false; mensaje: string }> {
    try {
      const guardada = await firstValueFrom(this.http.put<ConfiguracionApi>(this.url, config));
      this.vigente.set(guardada);
      return { ok: true, config: guardada };
    } catch (e) {
      return { ok: false, mensaje: mensajeDeError(e) };
    }
  }
}
