import { generarSiniestros } from '../data/generador-siniestros';
import { Siniestro } from '../models/siniestro.models';
import { aCsv, construirTabla } from '../services/exportacion';
import { FilaCruda, TablaCruda, ErrorLectura, decodificarTexto, detectarFormato, detectarSeparador, dividirCsv, parsearCsv, parsearJson } from './lector';
import { claveCabecera, sugerir } from './normalizar';
import { problemasACsv, rechazadasACsv, plantillaCsv } from './reporte';
import { franjaDeHora, parsearBooleano, parsearFecha, parsearHora, parsearNumero, resolverEdad, resolverRuta } from './valores';
import { analizarEstructura, claveDuplicado, validarTabla } from './validacion';

const HOY = new Date(2026, 10, 8);

/** Una fila válida tal como vendría en un archivo (todo texto) */
const base = (): Record<string, unknown> => ({
  Fecha: '2025-03-14', Franja: 'Mañana', Provincia: 'San José', 'Cantón': 'Escazú', Distrito: 'San Rafael',
  Ruta: 'Ruta 27', Km: '14', 'Vehículo': 'Motocicleta', Severidad: 'Grave', Fallecidos: '0', 'Heridos graves': '1',
  'Heridos leves': '0', Clima: 'Lluvia', Calzada: 'Húmeda', 'Señalización': 'Sí', Edad: '26-40', 'Género': 'Masculino',
  'Condición': 'Conductor', 'Respuesta (min)': '18',
});

const tabla = (filas: Record<string, unknown>[], formato: TablaCruda['formato'] = 'csv'): TablaCruda => ({
  formato,
  cabeceras: [...new Set(filas.flatMap((f) => Object.keys(f)))],
  filas: filas.map((valores, i): FilaCruda => ({ numero: i + 2, valores })),
});

const validar = (filas: Record<string, unknown>[], existentes: Siniestro[] = []) =>
  validarTabla(tabla(filas), { hoy: HOY, existentes });

const mensajes = (r: ReturnType<typeof validar>) => r.problemas.map((p) => `${p.campo}: ${p.mensaje}`).join(' | ');

describe('Lectura de archivos (RF-1)', () => {
  describe('CSV', () => {
    it('detecta el separador (; , tabulación)', () => {
      expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';');
      expect(detectarSeparador('a,b,c\n1,2,3')).toBe(',');
      expect(detectarSeparador('a\tb\tc')).toBe('\t');
      expect(detectarSeparador('un solo valor')).toBe(';');
    });

    it('respeta comillas, comillas dobles y saltos de línea dentro de comillas', () => {
      const filas = dividirCsv('a;b\r\n"x;y";"dice ""hola"""\r\n"línea 1\nlínea 2";z\r\n', ';');
      expect(filas).toEqual([['a', 'b'], ['x;y', 'dice "hola"'], ['línea 1\nlínea 2', 'z']]);
    });

    it('ignora el BOM y numera las filas como las ve la persona (cabecera = 1)', () => {
      const t = parsearCsv('﻿Fecha;Provincia\n2025-01-02;Limón\n\n2025-01-03;Cartago');
      expect(t.cabeceras).toEqual(['Fecha', 'Provincia']);
      expect(t.filas.map((f) => f.numero)).toEqual([2, 3, 4]);
      expect(t.filas[0].valores).toEqual({ Fecha: '2025-01-02', Provincia: 'Limón' });
    });

    it('si una columna se repite, la segunda recibe un nombre distinto', () => {
      expect(parsearCsv('Km;Km\n1;2').cabeceras).toEqual(['Km', 'Km (2)']);
    });

    it('marca las filas con más columnas que la cabecera', () => {
      const t = parsearCsv('a;b\n1;2\n1;2;3;4');
      expect(t.filas[0].errorEstructura).toBeUndefined();
      expect(t.filas[1].errorEstructura).toMatch(/columnas/);
    });

    it('quita la comilla simple con la que el sistema neutraliza fórmulas al exportar', () => {
      const t = parsearCsv("Km;Notas\n1;'=SUMA(A1)\n2;'-5\n3;'normal");
      expect(t.filas.map((f) => f.valores['Notas'])).toEqual(['=SUMA(A1)', '-5', "'normal"]);
    });

    it('rechaza archivos vacíos y comillas sin cerrar', () => {
      expect(() => parsearCsv('')).toThrowError(ErrorLectura);
      expect(() => parsearCsv('\n\n;;\n')).toThrowError(/vacío/);
      expect(() => parsearCsv('a;b\n"sin cerrar;2')).toThrowError(/comillas/);
    });
  });

  describe('JSON y GeoJSON', () => {
    it('lee una lista de objetos y las listas dentro de «registros» o «datos»', () => {
      expect(parsearJson('[{"fecha":"2025-01-01"},{"fecha":"2025-01-02","km":3}]').cabeceras).toEqual(['fecha', 'km']);
      expect(parsearJson('{"registros":[{"a":1}]}').filas.length).toBe(1);
      expect(parsearJson('{"datos":[{"a":1}]}').filas.length).toBe(1);
    });

    it('un elemento que no es objeto se marca como error de estructura', () => {
      const t = parsearJson('[{"a":1}, 5, "x"]');
      expect(t.filas[1].errorEstructura).toMatch(/objeto/);
      expect(t.filas[2].numero).toBe(3);
    });

    it('GeoJSON: las coordenadas del punto pasan a longitud/latitud (el orden de GeoJSON es lon, lat)', () => {
      const t = parsearJson(JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { fecha: '2025-01-01' }, geometry: { type: 'Point', coordinates: [-84.08, 9.93] } }],
      }));
      expect(t.formato).toBe('geojson');
      expect(t.filas[0].valores).toMatchObject({ fecha: '2025-01-01', longitud: -84.08, latitud: 9.93 });
    });

    it('errores claros: JSON roto, vacío o sin lista de registros', () => {
      expect(() => parsearJson('{no es json')).toThrowError(/JSON válido/);
      expect(() => parsearJson('[]')).toThrowError(/vacío/);
      expect(() => parsearJson('{"otra":1}')).toThrowError(/No se encontraron registros/);
    });
  });

  it('decodifica UTF-8, UTF-16 y el «CSV de Excel» guardado en Windows-1252 (sin romper las tildes)', () => {
    const utf8 = new TextEncoder().encode('San José;Limón');
    expect(decodificarTexto(utf8)).toEqual({ texto: 'San José;Limón', codificacion: 'UTF-8' });
    // "San José" en Windows-1252: la é es el byte 0xE9, que no es UTF-8 válido
    const ansi = Uint8Array.from([0x53, 0x61, 0x6e, 0x20, 0x4a, 0x6f, 0x73, 0xe9, 0x3b, 0x4c, 0x69, 0x6d, 0xf3, 0x6e]);
    expect(decodificarTexto(ansi)).toEqual({ texto: 'San José;Limón', codificacion: 'Windows-1252' });
    const utf16 = Uint8Array.from([0xff, 0xfe, 0x4a, 0x00, 0xe9, 0x00]);
    expect(decodificarTexto(utf16)).toEqual({ texto: 'Jé', codificacion: 'UTF-16' });
  });

  it('reconoce el formato por la extensión', () => {
    expect(detectarFormato('datos.CSV')).toBe('csv');
    expect(detectarFormato('a.json')).toBe('json');
    expect(detectarFormato('a.geojson')).toBe('geojson');
    expect(detectarFormato('a.xlsx')).toBe('excel');
    expect(detectarFormato('a.xls')).toBe('xls');
    expect(detectarFormato('a.pdf')).toBeNull();
  });
});

describe('Conversión de valores', () => {
  it('números: coma decimal, punto decimal y separadores de miles', () => {
    expect(parsearNumero('9,93')).toBe(9.93);
    expect(parsearNumero('9.93')).toBe(9.93);
    expect(parsearNumero(' 12 ')).toBe(12);
    expect(parsearNumero('1.234,5')).toBe(1234.5);
    expect(parsearNumero('1,234.5')).toBe(1234.5);
    expect(parsearNumero('-84,0877')).toBe(-84.0877);
    expect(parsearNumero(7)).toBe(7);
  });

  it('números: lo que no es número da null (nunca NaN)', () => {
    for (const malo of ['abc', '', '1,2,3', '1.2.3', '12abc', NaN, Infinity, null, undefined, {}]) {
      expect(parsearNumero(malo)).toBeNull();
    }
  });

  it('fechas: ISO, día/mes/año, con hora y de Excel (Date)', () => {
    expect(parsearFecha('2025-03-14')).toEqual({ ok: true, fecha: { anio: 2025, mes: 3, dia: 14, hora: undefined } });
    expect(parsearFecha('14/03/2025')).toMatchObject({ ok: true, fecha: { anio: 2025, mes: 3, dia: 14 } });
    expect(parsearFecha('2025-03-14 07:45')).toMatchObject({ ok: true, fecha: { hora: 7 } });
    expect(parsearFecha('2025-03-14T21:05:00Z')).toMatchObject({ ok: true, fecha: { hora: 21 } });
    expect(parsearFecha(new Date(Date.UTC(2025, 2, 14)))).toMatchObject({ ok: true, fecha: { anio: 2025, mes: 3, dia: 14 } });
  });

  it('fechas: distingue formato desconocido de fecha que no existe', () => {
    expect(parsearFecha('31/02/2025')).toEqual({ ok: false, motivo: 'calendario' });
    expect(parsearFecha('2025-13-01')).toEqual({ ok: false, motivo: 'calendario' });
    expect(parsearFecha('marzo 14')).toEqual({ ok: false, motivo: 'formato' });
    expect(parsearFecha('2025-03-14 25:00')).toEqual({ ok: false, motivo: 'formato' });
    expect(parsearFecha(45000)).toEqual({ ok: false, motivo: 'formato' });
  });

  it('hora y franja: Madrugada 0–5, Mañana 6–11, Tarde 12–17, Noche 18–23', () => {
    expect([0, 5, 6, 11, 12, 17, 18, 23].map(franjaDeHora)).toEqual(
      ['Madrugada', 'Madrugada', 'Mañana', 'Mañana', 'Tarde', 'Tarde', 'Noche', 'Noche']);
    expect(parsearHora('07:45')).toBe(7);
    expect(parsearHora('7')).toBe(7);
    expect(parsearHora('24:00')).toBeNull();
    expect(parsearHora('12:75')).toBeNull();
  });

  it('sí/no en varias formas', () => {
    expect(['Sí', 'si', 'TRUE', '1', true].map(parsearBooleano)).toEqual([true, true, true, true, true]);
    expect(['No', 'false', '0', false].map(parsearBooleano)).toEqual([false, false, false, false]);
    expect(parsearBooleano('quizás')).toBeNull();
  });

  it('rutas y edades escritas de varias formas', () => {
    for (const v of ['Ruta 27', '27', 'ruta27', 'RN-27', 'Ruta nacional 27', 'ruta 027', 27]) expect(resolverRuta(v).texto).toBe('Ruta 27');
    expect(resolverRuta('Ruta 8')).toEqual({ texto: 'Ruta 8', enCatalogo: false });
    expect(resolverRuta('Autopista').texto).toBeNull();
    expect(resolverEdad('26 a 40').rango).toBe('26-40');
    expect(resolverEdad('60+').rango).toBe('>60');
    expect(resolverEdad('mas de 60').rango).toBe('>60');
    expect(resolverEdad('34').rango).toBe('26-40');
    expect(resolverEdad(17)).toEqual({ rango: null, menorDeEdad: true });
    expect(resolverEdad('joven').rango).toBeNull();
  });

  it('nombres de columna sin tildes ni símbolos, y sugerencias por parecido', () => {
    expect(claveCabecera('Heridos graves')).toBe('heridos_graves');
    expect(claveCabecera(' Señalización ')).toBe('senalizacion');
    expect(claveCabecera('Respuesta (min)')).toBe('respuesta_min');
    expect(sugerir('Lluvía fuerte', ['Lluvia', 'Lluvia fuerte'])).toBe('Lluvia fuerte');
    expect(sugerir('xyzxyz', ['Lluvia'])).toBeNull();
  });
});

describe('Validación de registros (RF-1)', () => {
  it('una fila completa y correcta se acepta sin problemas', () => {
    const r = validar([base()]);
    expect(r.importables).toBe(1);
    expect(r.problemas).toEqual([]);
    expect(r.registros[0]).toMatchObject({
      fecha: '2025-03-14', anio: 2025, mes: 3, diaSemana: 'Viernes', franja: 'Mañana', provincia: 'San José',
      canton: 'Escazú', distrito: 'San Rafael', ruta: 'Ruta 27', kilometro: 14, vehiculo: 'Motocicleta',
      severidad: 'Grave', fallecidos: 0, heridosGraves: 1, heridosLeves: 0, senalizacion: true, tiempoRespuestaMin: 18,
    });
    expect(r.puedeImportar).toBe(true);
    expect(r.calidadPct).toBe(100);
  });

  it('el día de la semana, el mes y el año se calculan desde la fecha', () => {
    const r = validar([{ ...base(), Fecha: '2024-02-29' }]);
    expect(r.registros[0]).toMatchObject({ anio: 2024, mes: 2, diaSemana: 'Jueves' });
  });

  describe('datos obligatorios', () => {
    it('cada campo obligatorio vacío rechaza la fila y dice cuál falta', () => {
      for (const campo of ['Fecha', 'Provincia', 'Cantón', 'Ruta', 'Km', 'Vehículo', 'Severidad', 'Fallecidos',
        'Heridos graves', 'Heridos leves', 'Clima', 'Calzada', 'Señalización', 'Edad', 'Género', 'Condición', 'Respuesta (min)']) {
        const r = validar([{ ...base(), [campo]: '  ' }]);
        expect(r.rechazados, campo).toBe(1);
        expect(r.problemas.some((p) => p.codigo === 'faltante' && p.campo === campo), campo).toBe(true);
      }
    });

    it('sin franja ni hora se rechaza; con solo hora se calcula la franja', () => {
      const sinHorario = base();
      delete sinHorario['Franja'];
      expect(validar([{ ...sinHorario, Franja: '' }]).problemas[0].mensaje).toMatch(/franja horaria/);
      const conHora = validar([{ ...sinHorario, Hora: '19:30' }]);
      expect(conHora.registros[0].franja).toBe('Noche');
    });

    it('la hora dentro de la fecha también sirve', () => {
      const f = { ...base(), Franja: '', Fecha: '2025-03-14 02:15' };
      expect(validar([f]).registros[0].franja).toBe('Madrugada');
    });

    it('hora y franja que se contradicen: se avisa y manda la franja', () => {
      const r = validar([{ ...base(), Hora: '20:00' }]);
      expect(r.importables).toBe(1);
      expect(r.registros[0].franja).toBe('Mañana');
      expect(r.problemas[0]).toMatchObject({ gravedad: 'advertencia', codigo: 'consistencia' });
    });
  });

  describe('tipos de datos', () => {
    it('fecha inexistente, con formato raro, año fuera del periodo y fecha futura', () => {
      expect(mensajes(validar([{ ...base(), Fecha: '31/02/2025' }]))).toMatch(/no existe en el calendario/);
      expect(mensajes(validar([{ ...base(), Fecha: 'ayer' }]))).toMatch(/no se reconoce como fecha/);
      expect(mensajes(validar([{ ...base(), Fecha: '2022-05-01' }]))).toMatch(/fuera del periodo.*2023–2025/);
      expect(validarTabla(tabla([{ ...base(), Fecha: '2025-12-30' }]), { hoy: new Date(2025, 5, 1) }).problemas[0].mensaje).toMatch(/posterior a hoy/);
    });

    it('números inválidos y fuera de rango', () => {
      expect(mensajes(validar([{ ...base(), Km: 'doce' }]))).toMatch(/no es un número/);
      expect(mensajes(validar([{ ...base(), Km: '-3' }]))).toMatch(/fuera del rango/);
      expect(mensajes(validar([{ ...base(), Km: '999' }]))).toMatch(/fuera del rango/);
      expect(mensajes(validar([{ ...base(), Fallecidos: '1,5' }]))).toMatch(/entero/);
      expect(mensajes(validar([{ ...base(), 'Heridos leves': '-1' }]))).toMatch(/fuera del rango/);
      expect(mensajes(validar([{ ...base(), 'Respuesta (min)': '5000' }]))).toMatch(/fuera del rango/);
      expect(mensajes(validar([{ ...base(), 'Señalización': 'tal vez' }]))).toMatch(/Sí o No/);
    });

    it('acepta el kilómetro con coma decimal', () => {
      expect(validar([{ ...base(), Km: '14,5' }]).registros[0].kilometro).toBe(14.5);
    });
  });

  describe('catálogos', () => {
    it('ignora mayúsculas y tildes, y entiende sinónimos', () => {
      const r = validar([{ ...base(), Provincia: 'LIMON', 'Vehículo': 'moto', Clima: 'aguacero', Calzada: 'mojada', 'Género': 'F', Ruta: '27' }]);
      expect(r.registros[0]).toMatchObject({ provincia: 'Limón', vehiculo: 'Motocicleta', clima: 'Lluvia fuerte', calzada: 'Húmeda', genero: 'Femenino' });
    });

    it('un valor desconocido se rechaza y sugiere el más parecido', () => {
      const r = validar([{ ...base(), Clima: 'Lluvia fuerta' }]);
      expect(r.rechazados).toBe(1);
      expect(mensajes(r)).toMatch(/¿Quiso decir «Lluvia fuerte»\?/);
    });

    it('ruta fuera del catálogo y edad de menor de edad', () => {
      expect(mensajes(validar([{ ...base(), Ruta: 'Ruta 8' }]))).toMatch(/no está en el catálogo de rutas/);
      expect(mensajes(validar([{ ...base(), Edad: '15' }]))).toMatch(/18 años o más/);
      expect(validar([{ ...base(), Edad: '34' }]).registros[0].edad).toBe('26-40');
    });

    it('cantón o distrito desconocidos NO rechazan: se importan con advertencia', () => {
      const r = validar([{ ...base(), 'Cantón': 'Tilarán', Distrito: 'Quebrada Grande' }]);
      expect(r.importables).toBe(1);
      expect(r.conAdvertencias).toBe(1);
      expect(r.problemas[0]).toMatchObject({ gravedad: 'advertencia', codigo: 'catalogo', campo: 'Cantón' });
      expect(r.registros[0].canton).toBe('Tilarán');
    });

    it('sin distrito se guarda «No indicado»', () => {
      expect(validar([{ ...base(), Distrito: '' }]).registros[0].distrito).toBe('No indicado');
    });
  });

  describe('coordenadas geográficas', () => {
    const conCoord = (lat: unknown, lon: unknown) => validar([{ ...base(), Latitud: lat, Longitud: lon }]);

    it('coordenadas dentro de Costa Rica se guardan (también con coma decimal)', () => {
      const r = conCoord('9,9341', '-84,0877');
      expect(r.registros[0]).toMatchObject({ latitud: 9.9341, longitud: -84.0877 });
    });

    it('sin coordenadas está bien (son opcionales)', () => {
      const r = validar([base()]);
      expect(r.importables).toBe(1);
      expect('latitud' in r.registros[0]).toBe(false);
    });

    it('fuera de Costa Rica se rechaza', () => {
      const r = conCoord('19.43', '-99.13'); // Ciudad de México
      expect(r.rechazados).toBe(1);
      expect(r.problemas[0]).toMatchObject({ codigo: 'coordenadas' });
      expect(r.problemas[0].mensaje).toMatch(/fuera de Costa Rica/);
    });

    it('detecta latitud y longitud invertidas', () => {
      expect(conCoord('-84.0877', '9.9341').problemas[0].mensaje).toMatch(/invertidas/);
    });

    it('una sola coordenada o un valor que no es número se rechaza', () => {
      expect(conCoord('9.93', '').problemas[0].mensaje).toMatch(/falta la longitud/);
      expect(conCoord('', '-84.08').problemas[0].mensaje).toMatch(/falta la latitud/);
      expect(conCoord('norte', '-84.08').problemas[0].mensaje).toMatch(/no es un número/);
    });
  });

  describe('consistencia', () => {
    it('la severidad debe ser la mayor entre las víctimas', () => {
      expect(mensajes(validar([{ ...base(), Severidad: 'Leve' }]))).toMatch(/debería ser «Grave»/);
      expect(mensajes(validar([{ ...base(), Severidad: 'Grave', Fallecidos: '1' }]))).toMatch(/debería ser «Fallecido»/);
      expect(validar([{ ...base(), Severidad: 'Fallecido', Fallecidos: '1' }]).importables).toBe(1);
      expect(validar([{ ...base(), Severidad: 'Leve', 'Heridos graves': '0', 'Heridos leves': '2' }]).importables).toBe(1);
    });

    it('el día de la semana informado que no coincide solo avisa', () => {
      const r = validar([{ ...base(), 'Día': 'Lunes' }]); // 2025-03-14 fue viernes
      expect(r.importables).toBe(1);
      expect(r.registros[0].diaSemana).toBe('Viernes');
      expect(r.problemas[0]).toMatchObject({ gravedad: 'advertencia', codigo: 'consistencia' });
    });

    it('valores poco comunes se importan con advertencia', () => {
      const r = validar([{ ...base(), 'Respuesta (min)': '200' }]);
      expect(r.importables).toBe(1);
      expect(r.problemas[0].codigo).toBe('atipico');
    });
  });

  describe('duplicados', () => {
    it('el mismo siniestro dos veces en el archivo: se importa una sola vez', () => {
      const r = validar([base(), base(), { ...base(), Km: '15' }]);
      expect(r.importables).toBe(2);
      expect(r.duplicadosArchivo).toBe(1);
      expect(r.problemas.find((p) => p.codigo === 'duplicado')?.mensaje).toMatch(/Duplicado de la fila 2/);
      expect(r.rechazados).toBe(0);
    });

    it('uno que ya está en el sistema no se vuelve a cargar', () => {
      const existente = { ...validar([base()]).registros[0], id: 1 };
      const r = validar([base()], [existente]);
      expect(r.importables).toBe(0);
      expect(r.duplicadosSistema).toBe(1);
      expect(r.puedeImportar).toBe(false);
    });

    it('los 8 000 registros de ejemplo no se consideran duplicados entre sí', () => {
      const datos = generarSiniestros();
      expect(new Set(datos.map(claveDuplicado)).size).toBe(datos.length);
    });
  });

  describe('estructura del archivo', () => {
    it('si falta una columna obligatoria no se valida fila por fila: se lista lo que falta', () => {
      const { Clima: _c, Calzada: _k, ...incompleta } = base();
      const r = validar([incompleta]);
      expect(r.estructura.faltantes).toEqual(['Clima', 'Calzada']);
      expect(r.puedeImportar).toBe(false);
      expect(r.importables + r.rechazados).toBe(0);
    });

    it('«Franja» u «Hora»: basta con una de las dos columnas', () => {
      const { Franja: _f, ...sinFranja } = base();
      expect(analizarEstructura(Object.keys(sinFranja)).estructura.faltantes).toEqual(['Franja (o Hora)']);
      expect(analizarEstructura([...Object.keys(sinFranja), 'Hora']).estructura.faltantes).toEqual([]);
    });

    it('reconoce nombres alternativos y separa las columnas que no usa', () => {
      const { estructura } = analizarEstructura(['fecha_siniestro', 'gravedad', 'sexo', 'rango_edad', 'Observaciones', 'ID']);
      expect(estructura.reconocidas.map((r) => r.campo.clave)).toEqual(['fecha', 'severidad', 'genero', 'edad', 'id']);
      expect(estructura.ignoradas).toEqual(['Observaciones']);
    });

    it('dos columnas para el mismo campo: se usa la primera y se avisa', () => {
      const { estructura, mapa } = analizarEstructura(['Provincia', 'province']);
      expect(estructura.repetidas).toEqual(['province']);
      expect(mapa.get('provincia')).toBe('Provincia');
    });

    it('filas con error de estructura se rechazan', () => {
      const t = tabla([base()]);
      t.filas.push({ numero: 3, valores: {}, errorEstructura: 'La fila tiene 25 columnas' });
      const r = validarTabla(t, { hoy: HOY });
      expect(r.rechazados).toBe(1);
      expect(r.problemas[0].codigo).toBe('estructura');
    });

    it('las filas completamente vacías se ignoran sin contar como error', () => {
      const r = validar([base(), { ...Object.fromEntries(Object.keys(base()).map((k) => [k, ''])) }]);
      expect(r.filasVacias).toBe(1);
      expect(r.filasLeidas).toBe(1);
      expect(r.rechazados).toBe(0);
    });
  });

  describe('reporte de calidad', () => {
    const mezcla = () => validar([
      base(),
      { ...base(), Km: '15' },
      { ...base(), Km: '16', Provincia: 'Narnia' },
      { ...base(), Km: '17', Fecha: '' },
      { ...base(), Km: '18', 'Cantón': 'Tilarán' },
      base(), // duplicado de la primera
      { ...base(), Km: '20', Distrito: '' },
    ]);

    it('cuenta importables, rechazados, advertencias y duplicados; todo suma', () => {
      const r = mezcla();
      expect(r.filasLeidas).toBe(7);
      expect(r.rechazados).toBe(2);
      expect(r.duplicadosArchivo).toBe(1);
      expect(r.importables).toBe(4);
      expect(r.conAdvertencias).toBe(1);
      expect(r.importables + r.rechazados + r.duplicadosArchivo + r.duplicadosSistema).toBe(r.filasLeidas);
      expect(r.calidadPct).toBeCloseTo((4 / 7) * 100, 5);
    });

    it('agrupa los problemas por tipo y guarda las filas rechazadas con sus motivos', () => {
      const r = mezcla();
      expect(r.porCodigo['faltante']).toBe(1);
      expect(r.porCodigo['catalogo']).toBe(2); // Narnia (error) + Tilarán (advertencia)
      expect(r.porCodigo['duplicado']).toBe(1);
      expect(r.rechazadas.map((x) => x.fila)).toEqual([4, 5]);
      expect(r.rechazadas[1].motivos[0]).toMatch(/Falta el dato obligatorio «Fecha»/);
    });

    it('mide qué tan completo viene cada campo', () => {
      const r = mezcla();
      const distrito = r.completitud.find((c) => c.clave === 'distrito')!;
      expect(distrito).toMatchObject({ enArchivo: true, presentes: 6, total: 7 });
      expect(distrito.pct).toBeCloseTo((6 / 7) * 100, 5);
      expect(r.completitud.find((c) => c.clave === 'latitud')).toMatchObject({ enArchivo: false, pct: 0 });
    });
  });
});

describe('Ida y vuelta: lo que exporta el Explorador se puede volver a cargar', () => {
  const originales = generarSiniestros(400, 99);

  it('CSV exportado → leído → validado: 0 problemas y los mismos datos', () => {
    const csv = aCsv(construirTabla(originales));
    const r = validarTabla(parsearCsv(csv), { hoy: HOY });
    expect(r.totalProblemas).toBe(0);
    expect(r.importables).toBe(originales.length);
    const sinId = originales.map(({ id: _id, ...resto }) => resto);
    expect(r.registros).toEqual(sinId);
  });

  it('JSON con los mismos registros también se carga sin problemas', () => {
    const r = validarTabla(parsearJson(JSON.stringify(originales)), { hoy: HOY });
    expect(r.totalProblemas).toBe(0);
    expect(r.importables).toBe(originales.length);
    expect(r.estructura.ignoradas.sort()).toEqual(['anio', 'mes']);
  });

  it('cargar de nuevo lo mismo: todo se detecta como duplicado', () => {
    const csv = aCsv(construirTabla(originales));
    const r = validarTabla(parsearCsv(csv), { hoy: HOY, existentes: originales });
    expect(r.importables).toBe(0);
    expect(r.duplicadosSistema).toBe(originales.length);
  });

  it('la plantilla descargable es un archivo válido', () => {
    const csv = plantillaCsv();
    const r = validarTabla(parsearCsv(csv), { hoy: HOY });
    expect(r.problemas).toEqual([]);
    expect(r.importables).toBeGreaterThan(0);
  });
});

describe('Reportes descargables', () => {
  it('el reporte de problemas lista fila, gravedad, tipo, campo, problema y valor', () => {
    const r = validar([{ ...base(), Provincia: 'Narnia' }]);
    const lineas = problemasACsv(r).split('\r\n');
    expect(lineas[0]).toBe('Fila;Gravedad;Tipo;Campo;Problema;Valor recibido');
    expect(lineas[1]).toMatch(/^2;Error;Valor no permitido;Provincia;/);
    expect(lineas[1]).toContain('Narnia');
  });

  it('neutraliza fórmulas: un valor que empieza con = no se ejecuta al abrirlo en Excel', () => {
    const r = validar([{ ...base(), Provincia: '=HYPERLINK("http://x")' }]);
    expect(problemasACsv(r)).toContain("'=HYPERLINK");
    expect(rechazadasACsv(r, Object.keys(base()))).toContain("'=HYPERLINK");
  });

  it('las filas rechazadas se exportan con sus datos originales y los motivos', () => {
    const t = tabla([base(), { ...base(), Km: 'xx' }]);
    const r = validarTabla(t, { hoy: HOY });
    const lineas = rechazadasACsv(r, t.cabeceras).split('\r\n');
    expect(lineas.length).toBe(2);
    expect(lineas[0].startsWith('Fila del archivo;Motivos;Fecha;')).toBe(true);
    expect(lineas[1]).toMatch(/^3;Km: «xx» no es un número\./);
  });
});
