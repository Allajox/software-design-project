package model.ingestion.parser;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import enums.FileFormat;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import model.ingestion.IngestionException;
import model.ingestion.ParseOptions;
import model.ingestion.SinisterBruteData;
import model.ingestion.TextNormalizer;
import model.ingestion.UploadedFile;

/**
 * Lector de JSON por flujo: recorre el arreglo de registros y materializa un objeto a la vez.
 *
 * Sirve para un arreglo en la raíz ([ {...}, {...} ]) y para GeoJSON del MOPT/SNIT
 * (jsonRecordsPath = "features"). Los objetos anidados se aplanan con punto: "properties.nombre".
 */
public class JsonParser implements FileParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public FileFormat formato() {
        return FileFormat.JSON;
    }

    @Override
    public List<String> leerEncabezados(UploadedFile archivo, ParseOptions opciones) throws IOException {
        List<String> encabezados = new ArrayList<>();
        try {
            recorrer(archivo, opciones, true, fila -> encabezados.addAll(fila.valores().keySet()));
        } catch (JsonProcessingException e) {
            throw new IngestionException("El JSON no es válido: " + resumirError(e), e);
        }
        return encabezados;
    }

    @Override
    public void parse(UploadedFile archivo, ParseOptions opciones, Consumer<SinisterBruteData> destino)
            throws IOException {
        try {
            recorrer(archivo, opciones, false, destino);
        } catch (JsonProcessingException e) {
            throw new IngestionException("El JSON no es válido: " + resumirError(e), e);
        }
    }

    private void recorrer(UploadedFile archivo, ParseOptions opciones, boolean soloPrimera,
                          Consumer<SinisterBruteData> destino) throws IOException {
        try (InputStream in = archivo.open();
             com.fasterxml.jackson.core.JsonParser p = MAPPER.getFactory().createParser(in)) {
            ubicarArreglo(p, opciones.jsonRecordsPath());
            int fila = 1; // la fila 1 es "el encabezado"; el primer objeto es la fila 2
            JsonToken t;
            while ((t = p.nextToken()) != null && t != JsonToken.END_ARRAY) {
                fila++;
                if (t == JsonToken.START_OBJECT) {
                    JsonNode nodo = MAPPER.readTree(p);
                    Map<String, String> plano = new LinkedHashMap<>();
                    aplanar("", nodo, plano);
                    destino.accept(new SinisterBruteData(fila, plano, false));
                } else {
                    p.skipChildren();
                    destino.accept(new SinisterBruteData(fila, Map.of(), true));
                }
                if (soloPrimera) {
                    return;
                }
            }
        }
    }

    /** Deja el parser sobre el START_ARRAY que contiene los registros. */
    private static void ubicarArreglo(com.fasterxml.jackson.core.JsonParser p, String ruta) throws IOException {
        JsonToken t = p.nextToken();
        if (ruta == null || ruta.isBlank()) {
            if (t != JsonToken.START_ARRAY) {
                throw new IngestionException(
                        "El JSON debe ser un arreglo de objetos (o el perfil debe indicar la ruta de los registros).");
            }
            return;
        }
        String[] segmentos = ruta.trim().split("\\.");
        for (int i = 0; i < segmentos.length; i++) {
            if (t != JsonToken.START_OBJECT) {
                throw new IngestionException("No se encontró la ruta de registros '" + ruta + "' en el JSON.");
            }
            boolean encontrado = false;
            while (p.nextToken() == JsonToken.FIELD_NAME) {
                String nombre = p.currentName();
                t = p.nextToken();
                if (nombre.equals(segmentos[i])) {
                    encontrado = true;
                    break;
                }
                p.skipChildren();
            }
            if (!encontrado) {
                throw new IngestionException("No se encontró la ruta de registros '" + ruta + "' en el JSON.");
            }
        }
        if (t != JsonToken.START_ARRAY) {
            throw new IngestionException("La ruta de registros '" + ruta + "' no apunta a un arreglo.");
        }
    }

    private static void aplanar(String prefijo, JsonNode nodo, Map<String, String> salida) {
        if (nodo.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> campos = nodo.fields();
            while (campos.hasNext()) {
                Map.Entry<String, JsonNode> campo = campos.next();
                String clave = prefijo.isEmpty() ? campo.getKey() : prefijo + "." + campo.getKey();
                aplanar(clave, campo.getValue(), salida);
            }
        } else if (nodo.isArray()) {
            salida.put(TextNormalizer.clave(prefijo), nodo.toString());
        } else {
            salida.put(TextNormalizer.clave(prefijo), nodo.isNull() ? "" : TextNormalizer.limpiar(nodo.asText()));
        }
    }

    /** Mensaje del error sin el contenido del archivo (solo ubicación y causa general). */
    private static String resumirError(JsonProcessingException e) {
        var loc = e.getLocation();
        String donde = loc == null ? "" : " (línea " + loc.getLineNr() + ", columna " + loc.getColumnNr() + ")";
        return "sintaxis incorrecta" + donde + ".";
    }
}
