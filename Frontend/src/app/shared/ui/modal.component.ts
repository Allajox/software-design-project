import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

let contador = 0;

/**
 * Ventana modal basada en el elemento nativo <dialog>: el navegador se encarga de dejar el
 * foco dentro, cerrar con Esc y oscurecer el fondo. El contenido va entre las etiquetas;
 * los botones de abajo se marcan con el atributo `acciones`.
 *
 *   <app-modal [abierto]="abierto()" titulo="..." (cerrar)="abierto.set(false)">
 *     ...contenido...
 *     <div acciones><button>Aceptar</button></div>
 *   </app-modal>
 */
@Component({
  selector: 'app-modal',
  imports: [IconComponent],
  template: `
    <dialog #dialogo class="modal" [attr.aria-labelledby]="idTitulo" (close)="alCerrarNativo()" (click)="clicEnFondo($event)">
      <div class="caja">
        <header>
          <h2 [id]="idTitulo">{{ titulo() }}</h2>
          <button type="button" class="x" aria-label="Cerrar ventana" (click)="cerrar.emit()"><app-icon name="cerrar" /></button>
        </header>
        <div class="cuerpo"><ng-content /></div>
        <footer><ng-content select="[acciones]" /></footer>
      </div>
    </dialog>
  `,
  styles: `
    dialog.modal {
      width: min(540px, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      padding: 0;
      color: var(--texto);
      background: #fff;
      border: 0;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
    }
    dialog.modal::backdrop { background: rgba(15, 25, 40, 0.55); }
    .caja { display: flex; flex-direction: column; max-height: calc(100vh - 2rem); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.2rem 0.4rem; }
    h2 { margin: 0; font-size: 1.1rem; color: var(--azul); }
    .x { display: inline-flex; padding: 4px; color: var(--gris); background: none; border: 0; border-radius: 6px; cursor: pointer; }
    .x:hover { background: var(--fondo); }
    .x:focus-visible { outline: 2px solid var(--azul-claro); }
    .cuerpo { padding: 0.4rem 1.2rem 0.8rem; overflow: auto; }
    footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0.6rem 1.2rem 1.1rem; }
    footer:empty { display: none; }
    /* el contenido proyectado con [acciones] reparte sus botones con espacio entre ellos */
    footer ::ng-deep [acciones] { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  `,
})
export class ModalComponent {
  readonly abierto = input(false);
  readonly titulo = input.required<string>();
  /** Se emite cuando la persona quiere cerrar (X, Esc o clic en el fondo) */
  readonly cerrar = output<void>();

  protected readonly idTitulo = `modal-titulo-${++contador}`;
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    effect(() => {
      const el = this.dialogo().nativeElement;
      if (this.abierto() && !el.open) el.showModal();
      else if (!this.abierto() && el.open) el.close();
    });
  }

  /** Esc cierra el <dialog> por su cuenta: avisamos para que quien lo usa actualice su estado */
  protected alCerrarNativo(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  /** Un clic sobre el fondo oscuro (no sobre la caja) cierra la ventana */
  protected clicEnFondo(e: MouseEvent): void {
    if (e.target === this.dialogo().nativeElement) this.cerrar.emit();
  }
}
