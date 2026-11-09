/**
 * Genera los archivos de ejemplo de la pantalla «Carga de datos» (public/ejemplos/).
 * Uso:  npm run ejemplos
 * Usa el mismo generador de datos de la aplicación (con otra semilla), así los ejemplos
 * son válidos por construcción; los del «archivo con errores» se dañan a propósito.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const salida = join(tmpdir(), `sivcr-gen-${process.pid}.mjs`);
await build({ entryPoints: ['src/app/core/data/generador-siniestros.ts'], bundle: true, format: 'esm', outfile: salida, logLevel: 'silent' });
const { generarSiniestros } = await import(pathToFileURL(salida).href);
rmSync(salida);

const destino = 'public/ejemplos';
mkdirSync(destino, { recursive: true });

const COLUMNAS = ['Fecha', 'Franja', 'Provincia', 'Cantón', 'Distrito', 'Ruta', 'Km', 'Vehículo', 'Severidad', 'Fallecidos',
  'Heridos graves', 'Heridos leves', 'Clima', 'Calzada', 'Señalización', 'Edad', 'Género', 'Condición', 'Respuesta (min)'];
const fila = (s) => [s.fecha, s.franja, s.provincia, s.canton, s.distrito, s.ruta, s.kilometro, s.vehiculo, s.severidad,
  s.fallecidos, s.heridosGraves, s.heridosLeves, s.clima, s.calzada, s.senalizacion ? 'Sí' : 'No', s.edad, s.genero, s.condicion, s.tiempoRespuestaMin];

const celda = (v) => { const t = String(v); return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const csv = (filas) => '﻿' + [COLUMNAS, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';

// Coordenadas aproximadas por provincia (solo de ejemplo: NO son la ubicación real del siniestro simulado)
const CENTRO = { 'San José': [9.93, -84.08], 'Alajuela': [10.02, -84.21], 'Cartago': [9.86, -83.92], 'Heredia': [10.0, -84.12],
  'Guanacaste': [10.63, -85.44], 'Puntarenas': [9.98, -84.83], 'Limón': [9.99, -83.03] };
const jitter = (n) => Math.round(n * 10000) / 10000;
const conCoord = (s, i) => {
  const [lat, lon] = CENTRO[s.provincia];
  return { ...s, latitud: jitter(lat + (((i * 37) % 100) - 50) / 400), longitud: jitter(lon + (((i * 53) % 100) - 50) / 400) };
};

const datos = generarSiniestros(300, 7);
const sinId = (s) => { const { id, ...r } = s; return r; };

// 1) CSV válido (120 filas)
writeFileSync(`${destino}/siniestros-ejemplo.csv`, csv(datos.slice(0, 120).map(fila)));

// 2) CSV con errores a propósito (60 filas): cada tipo de problema aparece al menos una vez
const f = datos.slice(120, 180).map(fila);
const col = (n) => COLUMNAS.indexOf(n);
const mal = (i, nombre, valor) => { f[i][col(nombre)] = valor; };
mal(2, 'Fecha', '31/02/2024');                    // fecha inexistente
mal(3, 'Fecha', 'ayer');                          // no es fecha
mal(4, 'Fecha', '2021-06-10');                    // fuera del periodo
mal(5, 'Fecha', '');                              // falta dato obligatorio
mal(7, 'Provincia', 'Narnia');                    // valor no permitido
mal(8, 'Clima', 'Lluvía fuerta');                 // parecido a uno válido → sugerencia
mal(9, 'Ruta', 'Ruta 8');                         // ruta fuera del catálogo
mal(10, 'Km', 'doce');                            // no es número
mal(11, 'Km', '950');                             // fuera de rango
mal(12, 'Fallecidos', '1,5');                     // no es entero
mal(13, 'Edad', '15');                            // menor de edad
mal(14, 'Señalización', 'tal vez');               // sí/no inválido
mal(15, 'Respuesta (min)', '3000');               // fuera de rango
mal(16, 'Severidad', f[16][col('Severidad')] === 'Leve' ? 'Fallecido' : 'Leve'); // contradice las víctimas
mal(17, 'Cantón', 'Tilarán');                     // solo advertencia (cantón fuera del catálogo de referencia)
mal(18, 'Respuesta (min)', '240');                // solo advertencia (valor atípico)
f[20] = [...f[19]];                               // duplicado exacto de la fila anterior
f[22] = [...f[21]];                               // otro duplicado
f.push(['2025-02-30', 'Tarde', 'Cartago', 'Cartago', 'Oriental', 'Ruta 2', '10']); // fila corta: faltan columnas
writeFileSync(`${destino}/siniestros-con-errores.csv`, csv(f));

// 3) JSON (50 registros, con coordenadas válidas)
writeFileSync(`${destino}/siniestros-ejemplo.json`, JSON.stringify(datos.slice(180, 230).map((s, i) => sinId(conCoord(s, i))), null, 1));

// 4) GeoJSON (30 puntos; las coordenadas van en geometry, orden [longitud, latitud])
const features = datos.slice(230, 260).map((s, i) => {
  const { latitud, longitud, ...props } = conCoord(sinId(s), i);
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [longitud, latitud] } };
});
writeFileSync(`${destino}/siniestros-ejemplo.geojson`, JSON.stringify({ type: 'FeatureCollection', features }, null, 1));

// 5) Excel (40 filas; la fecha va como fecha real de Excel)
const { default: escribirXlsx } = await import('write-excel-file/node');
const filasXlsx = [
  COLUMNAS.map((c) => ({ value: c, fontWeight: 'bold' })),
  ...datos.slice(260, 300).map((s) => fila(s).map((v, i) => (i === 0
    ? { value: new Date(`${v}T00:00:00Z`), format: 'yyyy-mm-dd' }
    : v)),
  ),
];
await escribirXlsx(filasXlsx).toFile(`${destino}/siniestros-ejemplo.xlsx`);
console.log('Ejemplos generados en', destino);
