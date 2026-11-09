import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  ANIOS, CALZADAS, CLIMAS, DIAS, EDADES, FRANJAS, GENEROS, MESES, PROVINCIAS, RUTAS,
  SEVERIDADES, VEHICULOS,
} from '../../../core/models/catalogos';
import { ClaveFiltroLista, Filtros } from '../../../core/models/siniestro.models';
import { AvisosService } from '../../../core/services/avisos.service';
import { ConsultasService } from '../../../core/services/consultas.service';
import { FiltrosService } from '../../../core/services/filtros.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ChipsFiltroComponent, OpcionChip } from '../../../shared/ui/chips-filtro.component';
import { DialogoNombreConsultaComponent } from '../../../shared/ui/dialogo-nombre-consulta.component';
import { fmtEntero } from '../../../shared/utils/formato';

type CampoSelect = 'provincia' | 'canton' | 'distrito' | 'ruta';

/** Convierte una lista de textos en opciones de chip (valor = texto) */
function deTextos<T extends string>(lista: readonly T[]): OpcionChip<T>[] {
  return lista.map((valor) => ({ valor, texto: valor }));
}

/**
 * Panel de filtros multidimensionales (RF-2).
 * Solo habla con FiltrosService: no calcula nada, así el dashboard y otras pantallas
 * pueden reutilizarlo.
 */
@Component({
  selector: 'app-panel-filtros',
  imports: [IconComponent, ChipsFiltroComponent, DialogoNombreConsultaComponent],
  templateUrl: './panel-filtros.component.html',
  styleUrl: './panel-filtros.component.scss',
})
export class PanelFiltrosComponent implements OnInit {
  protected readonly srv = inject(FiltrosService);
  private readonly consultas = inject(ConsultasService);
  private readonly avisos = inject(AvisosService);

  /** Guardar consultas es para quienes analizan (el Consultor Público no) */
  protected readonly puedeGuardar = this.consultas.habilitado;
  protected readonly dialogoGuardar = signal(false);

  /** Cantidad de siniestros que cumplen los filtros / total registrado */
  readonly mostrando = input.required<number>();
  readonly total = input.required<number>();

  /** El dashboard lo muestra abierto; otras pantallas (tablas) lo pueden iniciar cerrado */
  readonly inicialmenteAbierto = input(true);
  protected readonly abierto = signal(true);

  ngOnInit(): void {
    this.abierto.set(this.inicialmenteAbierto());
  }
  protected readonly f = this.srv.filtros;

  protected readonly resumen = computed(
    () => `Mostrando ${fmtEntero(this.mostrando())} de ${fmtEntero(this.total())} siniestros`,
  );

  // ----- Opciones de cada filtro -----
  protected readonly provincias = PROVINCIAS;
  protected readonly rutas = RUTAS;

  protected readonly opcAnios: OpcionChip<(typeof ANIOS)[number]>[] = ANIOS.map((a) => ({ valor: a, texto: String(a) }));
  protected readonly opcMeses: OpcionChip<number>[] = MESES.map((m, i) => ({
    valor: i + 1,
    texto: m.slice(0, 3),
    descripcion: m,
  }));
  protected readonly opcDias: OpcionChip<(typeof DIAS)[number]>[] = DIAS.map((d) => ({
    valor: d,
    texto: d.slice(0, 3),
    descripcion: d,
  }));
  protected readonly opcFranjas = deTextos(FRANJAS);
  protected readonly opcVehiculos = deTextos(VEHICULOS);
  protected readonly opcSeveridades = deTextos(SEVERIDADES);
  protected readonly opcClimas = deTextos(CLIMAS);
  protected readonly opcCalzadas = deTextos(CALZADAS);
  protected readonly opcEdades = deTextos(EDADES);
  protected readonly opcGeneros = deTextos(GENEROS);

  protected guardarConsulta(nombre: string): void {
    const error = this.consultas.guardar(nombre, this.srv.filtros());
    if (error) {
      this.avisos.error(error);
      return;
    }
    this.dialogoGuardar.set(false);
    this.avisos.exito(`Consulta «${nombre}» guardada. La encuentra en el Historial de consultas.`);
  }

  protected cambiarSelect(campo: CampoSelect, evento: Event): void {
    this.srv.establecer(campo, (evento.target as HTMLSelectElement).value);
  }

  protected alternar<K extends ClaveFiltroLista>(campo: K, valor: Filtros[K][number]): void {
    this.srv.alternar(campo, valor);
  }
}
