import { Component, inject } from '@angular/core';
import { AvisosService } from '../../core/services/avisos.service';
import { IconComponent } from '../icon/icon.component';

/** Muestra los avisos del AvisosService. Va una sola vez en el layout principal. */
@Component({
  selector: 'app-avisos',
  imports: [IconComponent],
  template: `
    <div class="avisos" aria-live="polite">
      @for (a of srv.avisos(); track a.id) {
        <div class="aviso" [class.exito]="a.tipo === 'exito'" [class.error]="a.tipo === 'error'" [attr.role]="a.tipo === 'error' ? 'alert' : 'status'">
          <span class="icono" aria-hidden="true">{{ a.tipo === 'exito' ? '✓' : a.tipo === 'error' ? '!' : 'i' }}</span>
          <span class="texto">{{ a.texto }}</span>
          <button type="button" aria-label="Cerrar aviso" (click)="srv.cerrar(a.id)"><app-icon name="cerrar" /></button>
        </div>
      }
    </div>
  `,
  styles: `
    .avisos {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(380px, calc(100vw - 2rem));
    }
    .aviso {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      font-size: 0.88rem;
      color: #fff;
      background: #1b2430;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      animation: entrar 0.18s ease-out;
    }
    .icono {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      line-height: 20px;
      text-align: center;
      font-size: 0.78rem;
      font-weight: 700;
      border-radius: 50%;
      background: #3987e5;
    }
    .exito .icono { background: #2e9e5b; }
    .error .icono { background: #d6453d; }
    .texto { flex: 1; line-height: 1.35; }
    button {
      flex-shrink: 0;
      display: inline-flex;
      padding: 2px;
      color: #c9d1db;
      background: none;
      border: 0;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover { color: #fff; }
    button:focus-visible { outline: 2px solid #fff; }
    button app-icon { width: 14px; height: 14px; }
    @keyframes entrar { from { opacity: 0; transform: translateY(8px); } }
    @media (prefers-reduced-motion: reduce) { .aviso { animation: none; } }
  `,
})
export class AvisosComponent {
  protected readonly srv = inject(AvisosService);
}
