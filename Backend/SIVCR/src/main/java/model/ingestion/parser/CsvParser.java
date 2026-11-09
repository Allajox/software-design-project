package model.ingestion.parser;

import enums.FileFormat;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CoderResult;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
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
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

/**
 * Lector de CSV por flujo (Apache Commons CSV): nunca carga el archivo completo en memoria.
 *
 * La codificación se detecta: si el contenido es UTF-8 válido se usa UTF-8; si no, la codificación
 * de respaldo del perfil (ISO-8859-1 para COSEVI, cuyos archivos se llaman "UTF8" pero no lo son).
 */
public class CsvParser implements FileParser {

    private static final int MUESTRA_CODIFICACION = 256 * 1024;

    @Override
    public FileFormat formato() {
        return FileFormat.CSV;
    }

    @Override
    public List<String> leerEncabezados(UploadedFile archivo, ParseOptions opciones) throws IOException {
        Charset cs = resolverCodificacion(archivo, opciones);
        try (Reader lector = abrir(archivo, cs); CSVParser csv = formato(opciones).parse(lector)) {
            Iterator<CSVRecord> it = csv.iterator();
            CSVRecord cabecera = siguiente(it);
            if (cabecera == null) {
                throw new IngestionException("El archivo CSV no tiene encabezado.");
            }
            List<String> encabezados = new ArrayList<>();
            for (String celda : cabecera) {
                encabezados.add(TextNormalizer.limpiar(celda));
            }
            return encabezados;
        }
    }

    @Override
    public void parse(UploadedFile archivo, ParseOptions opciones, Consumer<SinisterBruteData> destino)
            throws IOException {
        Charset cs = resolverCodificacion(archivo, opciones);
        try (Reader lector = abrir(archivo, cs); CSVParser csv = formato(opciones).parse(lector)) {
            Iterator<CSVRecord> it = csv.iterator();
            CSVRecord cabecera = siguiente(it);
            if (cabecera == null) {
                throw new IngestionException("El archivo CSV no tiene encabezado.");
            }
            List<String> claves = new ArrayList<>();
            for (String celda : cabecera) {
                claves.add(TextNormalizer.clave(celda));
            }
            CSVRecord registro;
            while ((registro = siguiente(it)) != null) {
                destino.accept(aFila(registro, claves));
            }
        }
    }

    private static SinisterBruteData aFila(CSVRecord registro, List<String> claves) {
        Map<String, String> valores = new LinkedHashMap<>();
        for (int i = 0; i < claves.size(); i++) {
            valores.put(claves.get(i), i < registro.size() ? TextNormalizer.limpiar(registro.get(i)) : "");
        }
        boolean malformada = registro.size() != claves.size();
        return new SinisterBruteData((int) registro.getRecordNumber(), valores, malformada);
    }

    /** Solo protege la lectura del iterador: los errores del consumidor no deben confundirse con CSV roto. */
    private static CSVRecord siguiente(Iterator<CSVRecord> it) {
        try {
            return it.hasNext() ? it.next() : null;
        } catch (UncheckedIOException | IllegalStateException e) {
            throw new IngestionException("El CSV está mal formado (comillas sin cerrar o fila ilegible).", e);
        }
    }

    private static CSVFormat formato(ParseOptions opciones) {
        return CSVFormat.DEFAULT.builder()
                .setDelimiter(opciones.delimiter())
                .setQuote('"')
                .setIgnoreEmptyLines(true)
                .build();
    }

    private static Reader abrir(UploadedFile archivo, Charset cs) throws IOException {
        return new BufferedReader(new InputStreamReader(archivo.open(), cs), 1 << 16);
    }

    static Charset resolverCodificacion(UploadedFile archivo, ParseOptions opciones) throws IOException {
        if (opciones.charset() != null) {
            return opciones.charset();
        }
        Charset respaldo = opciones.fallbackCharset() != null ? opciones.fallbackCharset() : StandardCharsets.ISO_8859_1;
        byte[] muestra;
        try (InputStream in = archivo.open()) {
            muestra = in.readNBytes(MUESTRA_CODIFICACION);
        }
        return esUtf8Valido(muestra, muestra.length < MUESTRA_CODIFICACION) ? StandardCharsets.UTF_8 : respaldo;
    }

    /** completo = la muestra es el archivo entero; si no, un carácter cortado al final no cuenta como error. */
    private static boolean esUtf8Valido(byte[] muestra, boolean completo) {
        CharsetDecoder decodificador = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        ByteBuffer entrada = ByteBuffer.wrap(muestra);
        CharBuffer salida = CharBuffer.allocate(muestra.length + 1);
        CoderResult resultado = decodificador.decode(entrada, salida, completo);
        if (resultado.isError()) {
            return false;
        }
        if (completo) {
            try {
                return !decodificador.flush(salida).isError();
            } catch (IllegalStateException e) {
                return false;
            }
        }
        return true;
    }
}
