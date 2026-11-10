import { Component, computed, inject, input } from '@angular/core';
import { CALZADAS, CLIMAS, DIAS, EDADES, FRANJAS, GENEROS, MESES, PROVINCIAS } from '../../../core/models/catalogos';
import { CAMPOS_FILTRO_PANEL, CampoFiltroPanel } from '../../../core/models/filtros-panel';
import { FiltrosPanelService } from '../../../core/services/filtros-panel.service';
import { OpcionesPanelService } from '../../../core/services/opciones-panel.service';
import { fmtEntero } from '../../../shared/utils/formato';

interface Opcion {
  valor: string;
  texto: string;
}

interface Selector {
  clave: CampoFiltroPanel;
  etiqueta: string;
  /** Lo que dice la opción sin filtro («Todos», «Todas»…) */
  todos: string;
  opciones: Opcion[];
  deshabilitado: boolean;
  pista: string | null;
}

const iguales = (lista: readonly string[]): Opcion[] => lista.map((v) => ({ valor: v, texto: v }));

/** Cómo se llama la opción «sin filtro» en cada lista (Figma: «Todas», «Todos», «Nacional y Cantonal»). */
const TODOS: Record<CampoFiltroPanel, string> = {
  provincia: 'Todas', canton: 'Todos', distrito: 'Todos', ruta: 'Nacional y cantonal', anio: 'Todos', mes: 'Todos',
  dia: 'Todos', franja: 'Todos', vehiculo: 'Todos', clima: 'Todos', calzada: 'Todas', edad: 'Todas', genero: 'Todos',
};

/**
 * Los 13 filtros del panel de indicadores (Figma): listas desplegables de UNA sola opción, con «Todos» por defecto.
 * Cantones, distritos, rutas, años y vehículos salen de los datos reales (OpcionesPanelService). Elegir un cantón sin
 * haber elegido provincia elige también su provincia; el distrito espera a que haya un cantón.
 */
@Component({
  selector: 'app-panel-selectores',
  templateUrl: './panel-selectores.component.html',
  styleUrl: './panel-selectores.component.scss',
})
export class PanelSelectoresComponent {
  protected readonly srv = inject(FiltrosPanelService);
  private readonly opciones = inject(OpcionesPanelService);
  protected readonly f = this.srv.filtros;

  /** Siniestros que cumplen los filtros y total registrado */
  readonly mostrando = input.required<number>();
  readonly total = input.required<number>();

  protected readonly errorOpciones = this.opciones.error;

  protected readonly selectores = computed<Selector[]>(() => {
    const f = this.f();
    const datos = this.opciones.datos();
    const lista: Record<CampoFiltroPanel, Opcion[]> = {
      provincia: iguales(PROVINCIAS),
      canton: iguales(this.opciones.cantones(f.provincia)),
      distrito: iguales(this.opciones.distritos(f.canton)),
      ruta: iguales(datos.rutas),
      anio: datos.anios.map((a) => ({ valor: String(a), texto: String(a) })),
      mes: MESES.map((m, i) => ({ valor: String(i + 1), texto: m })),
      dia: iguales(DIAS),
      franja: iguales(FRANJAS),
      vehiculo: iguales(datos.vehiculos),
      clima: iguales(CLIMAS),
      calzada: iguales(CALZADAS),
      edad: iguales(EDADES),
      genero: iguales(GENEROS),
    };
    return CAMPOS_FILTRO_PANEL.map((c) => ({
      clave: c.clave,
      etiqueta: c.etiqueta,
      todos: TODOS[c.clave],
      opciones: lista[c.clave],
      deshabilitado: c.clave === 'distrito' && !f.canton,
      pista: c.clave === 'distrito' && !f.canton ? 'Elija primero un cantón' : null,
    }));
  });

  protected readonly resumen = computed(
    () => `Mostrando ${fmtEntero(this.mostrando())} de ${fmtEntero(this.total())} siniestros`,
  );

  protected cambiar(clave: CampoFiltroPanel, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    if (clave === 'canton' && valor && !this.f().provincia) {
      this.srv.establecer('provincia', this.opciones.provinciaDe(valor));
    }
    this.srv.establecer(clave, valor);
  }

  protected reintentar(): void {
    this.opciones.reintentar();
  }
}
