import { Component, computed, input } from '@angular/core';

export type IconoNombre =
  | 'dashboard' | 'tabla' | 'subir' | 'historial' | 'mapa' | 'riesgo'
  | 'simulador' | 'usuarios' | 'salir' | 'menu' | 'cerrar' | 'chevrones'
  | 'filtros' | 'chevron-abajo' | 'descargar' | 'columnas' | 'guardar' | 'papelera' | 'editar' | 'mas' | 'aplicar';

/** Cada ícono es una lista de trazos SVG (viewBox 24x24, estilo línea). */
const ICONOS: Record<IconoNombre, string[]> = {
  dashboard: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
  tabla: ['M4 5h16v14H4z', 'M4 10h16', 'M4 15h16', 'M10 5v14'],
  subir: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  historial: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  mapa: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', 'M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z'],
  riesgo: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17.5h.01'],
  simulador: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', 'M13 4v4h4V4z', 'M7 10v4h4v-4z', 'M15 16v4h4v-4z'],
  usuarios: ['M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1', 'M10 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M20 20v-1a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  salir: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  cerrar: ['M6 6l12 12', 'M18 6L6 18'],
  chevrones: ['M11 17l-5-5 5-5', 'M18 17l-5-5 5-5'],
  filtros: ['M3 4h18l-7 8v6l-4 2v-8z'],
  'chevron-abajo': ['M6 9l6 6 6-6'],
  descargar: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 21h16'],
  columnas: ['M4 4h16v16H4z', 'M9.5 4v16', 'M14.5 4v16'],
  guardar: ['M5 3h11l4 4v14H5z', 'M8 3v6h7V3', 'M8 21v-7h8v7'],
  papelera: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
  editar: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  mas: ['M12 5v14', 'M5 12h14'],
  aplicar: ['M5 12l5 5L20 7'],
};

@Component({
  selector: 'app-icon',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @for (d of trazos(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; width: 20px; height: 20px; flex-shrink: 0; }
    svg { width: 100%; height: 100%; }
  `,
})
export class IconComponent {
  readonly name = input.required<IconoNombre>();
  protected readonly trazos = computed(() => ICONOS[this.name()]);
}
