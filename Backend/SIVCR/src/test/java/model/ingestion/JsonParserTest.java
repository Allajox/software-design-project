package model.ingestion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import model.ingestion.parser.JsonParser;
import org.junit.jupiter.api.Test;

/** Datos 100% sintéticos (ver TestSupport). */
class JsonParserTest {

    private final JsonParser parser = new JsonParser();

    private static UploadedFile json(String texto) {
        return UploadedFile.of("datos.json", texto.getBytes(StandardCharsets.UTF_8));
    }

    private static ParseOptions ruta(String recordsPath) {
        return new ParseOptions(null, StandardCharsets.ISO_8859_1, ',', recordsPath, null);
    }

    @Test
    void leeUnArregloDeObjetosEnLaRaizYAplanaLosAnidados() throws IOException {
        List<SinisterBruteData> filas = parser.parse(json("""
                [
                  {"Año": 2024, "Cantón": "Pérez Zeledón", "detalle": {"clima": "Lluvia", "x": {"y": 1}},
                   "lista": [1, 2], "nulo": null, "activo": true},
                  {"Año": 2023, "Cantón": "Heredia"}
                ]
                """), ruta(null));

        assertEquals(2, filas.size());
        SinisterBruteData f = filas.get(0);
        assertEquals(2, f.fila());
        assertEquals("2024", f.valor("ano"));
        assertEquals("Pérez Zeledón", f.valor("canton"));
        assertEquals("Lluvia", f.valor("detalle.clima"));
        assertEquals("1", f.valor("detalle.x.y"));
        assertEquals("[1,2]", f.valor("lista"));
        assertEquals("", f.valor("nulo"));
        assertEquals("true", f.valor("activo"));
        assertEquals(3, filas.get(1).fila());
    }

    @Test
    void leeGeoJsonDelMoptConRutaDeRegistros() throws IOException {
        List<SinisterBruteData> filas = parser.parse(json("""
                {"type": "FeatureCollection", "crs": {"type": "name"},
                 "features": [
                   {"type": "Feature", "properties": {"nombre": "Ruta de prueba"},
                    "geometry": {"type": "LineString", "coordinates": [[-84, 9], [-83, 10]]}}
                 ]}
                """), ruta("features"));

        assertEquals(1, filas.size());
        assertEquals("Ruta de prueba", filas.get(0).valor("properties.nombre"));
        assertEquals("LineString", filas.get(0).valor("geometry.type"));
        assertEquals("[[-84,9],[-83,10]]", filas.get(0).valor("geometry.coordinates"));
    }

    @Test
    void admiteRutaAnidadaConPuntos() throws IOException {
        List<SinisterBruteData> filas = parser.parse(
                json("{\"respuesta\": {\"datos\": [{\"a\": \"1\"}, {\"a\": \"2\"}]}, \"otro\": 5}"), ruta("respuesta.datos"));
        assertEquals(2, filas.size());
        assertEquals("2", filas.get(1).valor("a"));
    }

    @Test
    void leerEncabezadosUsaElPrimerObjeto() throws IOException {
        List<String> encabezados = parser.leerEncabezados(json("[{\"Año\": 1, \"B\": 2}, {\"C\": 3}]"), ruta(null));
        assertEquals(List.of("ano", "b"), encabezados);
    }

    @Test
    void unElementoQueNoEsObjetoQuedaMalformado() throws IOException {
        List<SinisterBruteData> filas = parser.parse(json("[{\"a\": 1}, 5, [1, 2], {\"a\": 2}]"), ruta(null));
        assertEquals(4, filas.size());
        assertTrue(filas.get(1).malformada());
        assertTrue(filas.get(2).malformada());
        assertEquals("2", filas.get(3).valor("a"));
    }

    @Test
    void unJsonConSintaxisIncorrectaSeReportaSinMostrarSuContenido() {
        IngestionException e = assertThrows(IngestionException.class,
                () -> parser.parse(json("[{\"cedula\": \"secreto-123\" \"x\": }]"), ruta(null)));
        assertTrue(e.getMessage().contains("no es válido"));
        assertTrue(!e.getMessage().contains("secreto-123"), e.getMessage());
    }

    @Test
    void sinRutaLaRaizDebeSerUnArreglo() {
        assertThrows(IngestionException.class, () -> parser.parse(json("{\"a\": []}"), ruta(null)));
    }

    @Test
    void rutaInexistenteOQueNoEsArregloFallaConMensaje() {
        IngestionException noExiste = assertThrows(IngestionException.class,
                () -> parser.parse(json("{\"a\": []}"), ruta("features")));
        assertTrue(noExiste.getMessage().contains("features"));
        assertThrows(IngestionException.class, () -> parser.parse(json("{\"features\": 5}"), ruta("features")));
    }
}
