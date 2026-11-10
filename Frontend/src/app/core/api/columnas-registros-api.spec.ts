import { COLUMNAS_API, siguienteOrden } from './columnas-registros-api';
import { SiniestroApi } from './modelos-api';
import { CAMPOS_ORDENABLES, parametroOrden } from './registros-api.service';

const base: SiniestroApi = {
  provincia: 'HEREDIA', canton: 'Santo Domingo', distrito: 'San Miguel', ruta: '32', km: 7, lat: null, lon: null,
  tipoVehiculo: null, severidad: 'SOLO_HERIDOS_LEVES', clima: 'LLUVIA', calzada: 'BUENA', tiempoRespuestaMins: null,
  calidad: 'VALIDO', fecha: null, anio: 2024, mes: 7, diaSemana: 'MARTES', franja: 'NOCHE', victima: null,
};

const texto = (clave: string, s: SiniestroApi) => COLUMNAS_API.find((c) => c.clave === clave)!.texto(s);

describe('Tabla de registros conectada al servidor', () => {
  it('muestra los datos con etiquetas en español', () => {
    expect(texto('provincia', base)).toBe('Heredia');
    expect(texto('mes', base)).toBe('Julio');
    expect(texto('diaSemana', base)).toBe('Martes');
    expect(texto('franja', base)).toBe('Noche');
    expect(texto('severidad', base)).toBe('Solo heridos leves');
    expect(texto('km', base)).toBe('7');
  });

  it('lo que COSEVI no trae se ve como raya, nunca como 0 ni "null"', () => {
    const vacio: SiniestroApi = { ...base, km: null, ruta: null, canton: '  ', anio: null, mes: null, franja: null, clima: null };
    for (const c of COLUMNAS_API) expect(c.texto(vacio)).not.toMatch(/null|undefined|^0$/);
    expect(texto('km', vacio)).toBe('—');
    expect(texto('canton', vacio)).toBe('—');
  });

  it('no inventa columnas que la fuente no entrega (vehículo, fecha exacta, coordenadas, tiempo de respuesta)', () => {
    const claves = COLUMNAS_API.map((c) => c.clave);
    for (const prohibida of ['tipoVehiculo', 'fecha', 'lat', 'lon', 'tiempoRespuestaMins']) {
      expect(claves).not.toContain(prohibida);
    }
  });

  it('solo se ordena por los campos que el servidor permite', () => {
    for (const c of COLUMNAS_API) {
      if (c.orden) expect(CAMPOS_ORDENABLES).toContain(c.orden);
    }
    expect(COLUMNAS_API.find((c) => c.clave === 'diaSemana')?.orden).toBeUndefined();
    expect(COLUMNAS_API.find((c) => c.clave === 'franja')?.orden).toBeUndefined();
  });

  it('el orden va ascendente → descendente → sin orden, y cambiar de columna reinicia', () => {
    const a = siguienteOrden(null, 'anio');
    expect(a).toEqual({ campo: 'anio', direccion: 'asc' });
    const d = siguienteOrden(a, 'anio');
    expect(d).toEqual({ campo: 'anio', direccion: 'desc' });
    expect(siguienteOrden(d, 'anio')).toBeNull();
    expect(siguienteOrden(d, 'mes')).toEqual({ campo: 'mes', direccion: 'asc' });
  });

  it('arma el parámetro sort como lo pide el backend', () => {
    expect(parametroOrden(null)).toBeUndefined();
    expect(parametroOrden({ campo: 'anio', direccion: 'asc' })).toBe('anio');
    expect(parametroOrden({ campo: 'canton', direccion: 'desc' })).toBe('canton:desc');
  });
});
