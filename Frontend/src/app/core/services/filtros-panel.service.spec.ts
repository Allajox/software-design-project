import { TestBed } from '@angular/core/testing';
import { FiltrosPanelService } from './filtros-panel.service';

describe('FiltrosPanelService', () => {
  let srv: FiltrosPanelService;
  beforeEach(() => {
    srv = TestBed.inject(FiltrosPanelService);
    srv.limpiar();
  });

  it('cambia un filtro y cuenta los activos', () => {
    srv.establecer('anio', '2024');
    srv.establecer('clima', 'Lluvia');
    expect(srv.filtros().anio).toBe('2024');
    expect(srv.activos()).toBe(2);
  });

  it('al cambiar la provincia se reinician cantón y distrito', () => {
    srv.establecer('provincia', 'Heredia');
    srv.establecer('canton', 'Barva');
    srv.establecer('distrito', 'San Pedro');
    srv.establecer('provincia', 'Cartago');
    expect(srv.filtros().canton).toBe('');
    expect(srv.filtros().distrito).toBe('');
  });

  it('al cambiar el cantón solo se reinicia el distrito', () => {
    srv.establecer('provincia', 'Heredia');
    srv.establecer('canton', 'Barva');
    srv.establecer('distrito', 'San Pedro');
    srv.establecer('canton', 'Belén');
    expect(srv.filtros().provincia).toBe('Heredia');
    expect(srv.filtros().distrito).toBe('');
  });

  it('alternar elige el valor y, si ya estaba elegido, lo quita (clic en un gráfico)', () => {
    srv.alternar('dia', 'Lunes');
    expect(srv.filtros().dia).toBe('Lunes');
    srv.alternar('dia', 'Martes');
    expect(srv.filtros().dia).toBe('Martes');
    srv.alternar('dia', 'Martes');
    expect(srv.filtros().dia).toBe('');
  });

  it('limpiar deja todo en «Todos»', () => {
    srv.establecer('provincia', 'Limón');
    srv.establecer('mes', '5');
    srv.limpiar();
    expect(srv.activos()).toBe(0);
  });
});
