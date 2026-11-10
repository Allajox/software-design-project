import {
  CALZADAS_CONFIG, CLIMAS_CONFIG, ConfiguracionApi, FormularioConfig, PESO_MAXIMO, aFormulario, formulaIss, hayCambios, hayCambiosAdversas, hayCambiosPesos,
  leerPeso, opcionesConDesconocidas, pesoATexto, validarConfig,
} from './configuracion-api';

const guardada: ConfiguracionApi = {
  wFallecido: 10, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA'], calzadaAdversa: ['MOJADA', 'RESBALADIZA'],
};
const formulario = (sobre: Partial<FormularioConfig> = {}): FormularioConfig => ({ ...aFormulario(guardada), ...sobre });

describe('Configuración del ISS (pesos y condiciones adversas)', () => {
  describe('leerPeso', () => {
    it.each([['10', 10], ['2,5', 2.5], ['2.5', 2.5], ['0', 0], ['0,25', 0.25], [' 7 ', 7], ['10,50', 10.5], ['3,10', 3.1]])(
      'acepta «%s» como %s', (texto, valor) => {
        expect(leerPeso(texto)).toEqual({ valor });
      });

    it('acepta el máximo que guarda la base y rechaza pasarse', () => {
      expect(leerPeso('999999,99')).toEqual({ valor: PESO_MAXIMO });
      expect(leerPeso('1000000')).toEqual({ error: 'No puede pasar de 999 999,99.' });
    });

    it('rechaza vacío, negativos, texto, notación científica y separadores sueltos', () => {
      expect(leerPeso('')).toEqual({ error: 'Escriba un número.' });
      expect(leerPeso('   ')).toEqual({ error: 'Escriba un número.' });
      expect(leerPeso('-1')).toEqual({ error: 'No puede ser negativo.' });
      for (const malo of ['abc', '1e3', '1,2,3', '5,', ',5', '1 000', '+4', '0x10']) {
        expect(leerPeso(malo), malo).toEqual({ error: 'Escriba un número, por ejemplo 10 o 2,5.' });
      }
    });

    it('rechaza más de 2 decimales, salvo ceros de relleno (la base guarda 2)', () => {
      expect(leerPeso('1,234')).toEqual({ error: 'Admite como máximo 2 decimales.' });
      expect(leerPeso('1,2300')).toEqual({ valor: 1.23 });
    });
  });

  describe('validarConfig', () => {
    it('con todo correcto devuelve la configuración lista para el PUT (pesos como número)', () => {
      const r = validarConfig(formulario({ wFallecido: '12,5', climaAdverso: ['NEBLINA', 'LLUVIA'], calzadaAdversa: [] }));
      expect(r.errores).toEqual({});
      expect(r.valor).toEqual({ wFallecido: 12.5, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['NEBLINA', 'LLUVIA'], calzadaAdversa: [] });
    });

    it('marca cada peso inválido junto a su campo y no entrega valor', () => {
      const r = validarConfig(formulario({ wFallecido: '', wHeridoGrave: '-2', wHeridoLeve: '1,234' }));
      expect(r.valor).toBeUndefined();
      expect(Object.keys(r.errores).sort()).toEqual(['wFallecido', 'wHeridoGrave', 'wHeridoLeve']);
    });

    it('no deja los tres pesos en cero (el ISS valdría siempre 0), igual que el servidor', () => {
      const r = validarConfig(formulario({ wFallecido: '0', wHeridoGrave: '0', wHeridoLeve: '0,00' }));
      expect(r.valor).toBeUndefined();
      expect(r.errores.general).toContain('Al menos un peso debe ser mayor que cero');
    });

    it('con un solo peso en cero sí es válido', () => {
      expect(validarConfig(formulario({ wHeridoLeve: '0' })).valor?.wHeridoLeve).toBe(0);
    });

    it('permite dejar vacías las listas de condiciones adversas', () => {
      expect(validarConfig(formulario({ climaAdverso: [], calzadaAdversa: [] })).valor).toBeDefined();
    });

    it('no comparte las listas del formulario con lo que se envía', () => {
      const f = formulario();
      const valor = validarConfig(f).valor!;
      expect(valor.climaAdverso).not.toBe(f.climaAdverso);
    });
  });

  describe('hayCambios', () => {
    it('sin tocar nada no hay cambios, y «10,0» equivale a «10»', () => {
      expect(hayCambios(guardada, aFormulario(guardada))).toBe(false);
      expect(hayCambios(guardada, formulario({ wFallecido: '10,0' }))).toBe(false);
    });

    it('cambiar un peso, o dejarlo ilegible, cuenta como cambio', () => {
      expect(hayCambios(guardada, formulario({ wHeridoLeve: '2' }))).toBe(true);
      expect(hayCambios(guardada, formulario({ wHeridoLeve: '' }))).toBe(true);
    });

    it('marcar o desmarcar condiciones cuenta, sin importar el orden', () => {
      expect(hayCambios(guardada, formulario({ calzadaAdversa: ['RESBALADIZA', 'MOJADA'] }))).toBe(false);
      expect(hayCambios(guardada, formulario({ calzadaAdversa: ['MOJADA'] }))).toBe(true);
      expect(hayCambios(guardada, formulario({ climaAdverso: ['LLUVIA', 'NEBLINA'] }))).toBe(true);
    });
  });

  describe('hayCambiosPesos y hayCambiosAdversas (cada columna se guarda por separado)', () => {
    it('un peso cambiado solo cuenta para los pesos', () => {
      const f = formulario({ wFallecido: '12' });
      expect(hayCambiosPesos(guardada, f)).toBe(true);
      expect(hayCambiosAdversas(guardada, f)).toBe(false);
    });
    it('una marca de clima o calzada solo cuenta para las condiciones adversas', () => {
      const f = formulario({ climaAdverso: ['LLUVIA', 'NEBLINA'] });
      expect(hayCambiosPesos(guardada, f)).toBe(false);
      expect(hayCambiosAdversas(guardada, f)).toBe(true);
    });
    it('un peso ilegible cuenta como cambio de pesos', () => {
      expect(hayCambiosPesos(guardada, formulario({ wHeridoGrave: 'x' }))).toBe(true);
    });
  });

  describe('presentación', () => {
    it('muestra los pesos con coma decimal', () => {
      expect(pesoATexto(2.5)).toBe('2,5');
      expect(aFormulario({ ...guardada, wFallecido: 7.25 }).wFallecido).toBe('7,25');
    });

    it('la fórmula usa los pesos escritos, y la sigla donde el valor todavía no sirve', () => {
      expect(formulaIss(formulario())).toBe('ISS = (10·fallecidos + 5·heridos graves + 1·heridos leves) ÷ total de siniestros');
      expect(formulaIss(formulario({ wHeridoGrave: 'x' }))).toContain('W2·heridos graves');
    });

    it('los valores guardados que la lista no conoce se muestran igual (para poder desmarcarlos)', () => {
      const opciones = opcionesConDesconocidas(CLIMAS_CONFIG, ['LLUVIA', 'GRANIZO']);
      expect(opciones.at(-1)).toEqual({ valor: 'GRANIZO', texto: 'GRANIZO' });
      expect(opciones).toHaveLength(CLIMAS_CONFIG.length + 1);
      expect(opcionesConDesconocidas(CALZADAS_CONFIG, ['MOJADA'])).toHaveLength(CALZADAS_CONFIG.length);
    });

    it('las listas ofrecen exactamente los valores que acepta el servidor (enums Climate y RoadStatus)', () => {
      expect(CLIMAS_CONFIG.map((o) => o.valor).sort()).toEqual(['BUEN_TIEMPO', 'LLUVIA', 'LLUVIA_CON_NEBLINA', 'NEBLINA', 'NUBLADO']);
      expect(CALZADAS_CONFIG.map((o) => o.valor).sort()).toEqual([
        'BUENA', 'CONSTRUCCION_O_REPARACION', 'DERRUMBE', 'HUECOS', 'HUNDIMIENTOS', 'MOJADA', 'OTROS', 'RESBALADIZA', 'SECA',
      ]);
    });
  });
});
