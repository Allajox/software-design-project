# Archivos de muestra (DATOS SINTÉTICOS)

Todo lo que hay en esta carpeta fue **inventado para probar la ingesta**. No proviene de COSEVI, INEC, MOPT ni IMN,
aunque imita sus columnas. No usar para análisis. Los archivos reales (COSEVI.csv, etc.) están en
`src/main/resources/` y pesan ~20 MB: no se usan como fixtures de pruebas.

| Archivo | Fuente | Resultado esperado |
|---|---|---|
| `SINTETICO-cosevi-siniestros.csv` | COSEVI | PARCIAL: 3 válidos, 1 incompleto (distrito "Desconocido"), 2 corruptos (año "2O24" con letra O; provincia inexistente) |
| `SINTETICO-cosevi-siniestros.json` | COSEVI | PARCIAL: 2 válidos, 0 incompletos, 1 corrupto (año "veinte") |
| `SINTETICO-cosevi-personas.csv` | COSEVI | PARCIAL: 3 válidos, 1 incompleto (lesión ignorada), 1 corrupto (edad 250) |
| `SINTETICO-inec-defunciones.csv` | INEC | EXITOSA: 3 válidos (causas V892, V031, V299) y 2 omitidos (causas J189, I219) |

Notas:
- Estos CSV están en UTF-8. Los archivos reales de COSEVI vienen en ISO-8859-1; esa codificación se prueba en
  `CsvParserTest` generando los bytes en el momento.
- No hay un `.xlsx` de muestra: los tests lo generan con Apache POI al ejecutarse.
- Para probar la carga manual desde Angular: fuente COSEVI + los dos primeros archivos; INEC + el último.
  Un mismo archivo no se puede cargar dos veces (detección por SHA-256).
