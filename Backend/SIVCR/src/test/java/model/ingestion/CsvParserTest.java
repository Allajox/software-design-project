package model.ingestion;

import static model.ingestion.TestSupport.ENC_PERSONAS;
import static model.ingestion.TestSupport.ENC_SINIESTROS;
import static model.ingestion.TestSupport.csvLatin1;
import static model.ingestion.TestSupport.perfil;
import static model.ingestion.TestSupport.persona;
import static model.ingestion.TestSupport.siniestro;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import model.ingestion.parser.CsvParser;
import org.junit.jupiter.api.Test;

/** Datos 100% sintéticos (ver TestSupport). */
class CsvParserTest {

    private final CsvParser parser = new CsvParser();
    private final ParseOptions opcionesCosevi = perfil("cosevi-siniestros").opcionesDeLectura();

    @Test
    void leeUnCsvEnIso88591ComoElArchivoRealDeCosevi() throws IOException {
        byte[] contenido = csvLatin1(ENC_SINIESTROS,
                siniestro("Provincia=Limón", "Cantón=Pérez Zeledón"),
                siniestro("Cantón=San José"));
        UploadedFile archivo = UploadedFile.of("siniestros.csv", contenido);

        List<SinisterBruteData> filas = parser.parse(archivo, opcionesCosevi);

        assertEquals(2, filas.size());
        assertEquals(2, filas.get(0).fila());   // el encabezado es la fila 1
        assertEquals(3, filas.get(1).fila());
        assertEquals("Limón", filas.get(0).valor("provincia"));
        assertEquals("Pérez Zeledón", filas.get(0).valor("canton"));
        assertEquals("2024", filas.get(0).valor("ano"));
        assertFalse(filas.get(0).malformada());
    }

    @Test
    void detectaUtf8ConBom() throws IOException {
        String texto = ENC_SINIESTROS + "\r\n" + siniestro("Provincia=Limón") + "\r\n";
        byte[] bom = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        salida.write(bom);
        salida.write(texto.getBytes(StandardCharsets.UTF_8));

        List<SinisterBruteData> filas = parser.parse(UploadedFile.of("utf8.csv", salida.toByteArray()), opcionesCosevi);

        assertEquals(1, filas.size());
        assertEquals("Limón", filas.get(0).valor("provincia"));
        assertEquals("Clase de accidente", parser.leerEncabezados(UploadedFile.of("utf8.csv", salida.toByteArray()),
                opcionesCosevi).get(0));
    }

    @Test
    void normalizaEncabezadosConEspaciosSobrantesYDobles() throws IOException {
        UploadedFile archivo = UploadedFile.of("personas.csv", csvLatin1(ENC_PERSONAS, persona()));
        SinisterBruteData fila = parser.parse(archivo, perfil("cosevi-personas").opcionesDeLectura()).get(0);

        assertEquals("Automóvil", fila.valor("vehiculo en el que viajaba")); // "Vehiculo en  el que viajaba"
        assertEquals("San José", fila.valor("provincia"));                    // "Provincia "
        assertEquals("Moravia", fila.valor("canton"));                        // "Cantón "
        assertEquals("6.Viernes", fila.valor("dia"));                         // "Día "
    }

    @Test
    void leerEncabezadosDevuelveLosNombresLimpios() throws IOException {
        List<String> encabezados = parser.leerEncabezados(
                UploadedFile.of("s.csv", csvLatin1(ENC_SINIESTROS, siniestro())), opcionesCosevi);
        assertEquals(21, encabezados.size());
        assertEquals("Provincia", encabezados.get(5));
        assertEquals("Mes", encabezados.get(20));
    }

    @Test
    void respetaCamposEntreComillasQueContienenElDelimitador() throws IOException {
        String fila = siniestro().replace("Santo Domingo", "\"Santo; Domingo\"");
        List<SinisterBruteData> filas = parser.parse(
                UploadedFile.of("q.csv", csvLatin1(ENC_SINIESTROS, fila)), opcionesCosevi);
        assertEquals("Santo; Domingo", filas.get(0).valor("canton"));
        assertFalse(filas.get(0).malformada());
    }

    @Test
    void marcaComoMalformadasLasFilasConOtraCantidadDeColumnas() throws IOException {
        byte[] contenido = csvLatin1(ENC_SINIESTROS,
                siniestro(),
                "Solo heridos leves;Vuelco;2024",
                siniestro() + ";sobrante");
        List<SinisterBruteData> filas = parser.parse(UploadedFile.of("m.csv", contenido), opcionesCosevi);

        assertEquals(3, filas.size());
        assertFalse(filas.get(0).malformada());
        assertTrue(filas.get(1).malformada());
        assertTrue(filas.get(2).malformada());
    }

    @Test
    void ignoraLineasVacias() throws IOException {
        byte[] contenido = (ENC_SINIESTROS + "\r\n\r\n" + siniestro() + "\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1);
        assertEquals(1, parser.parse(UploadedFile.of("v.csv", contenido), opcionesCosevi).size());
    }

    @Test
    void unArchivoVacioNoTieneEncabezado() {
        assertThrows(IngestionException.class,
                () -> parser.parse(UploadedFile.of("vacio.csv", new byte[0]), opcionesCosevi));
    }

    @Test
    void comillasSinCerrarSeReportanComoCsvMalFormado() {
        byte[] contenido = (ENC_SINIESTROS + "\r\n\"Solo heridos;Vuelco;2024").getBytes(StandardCharsets.ISO_8859_1);
        IngestionException e = assertThrows(IngestionException.class,
                () -> parser.parse(UploadedFile.of("roto.csv", contenido), opcionesCosevi));
        assertTrue(e.getMessage().contains("mal formado"));
    }

    @Test
    void unaFalloDelConsumidorNoSeDisfrazaDeCsvInvalido() {
        UploadedFile archivo = UploadedFile.of("s.csv", csvLatin1(ENC_SINIESTROS, siniestro()));
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> parser.parse(archivo, opcionesCosevi,
                fila -> {
                    throw new IllegalStateException("falla del destino");
                }));
        assertEquals("falla del destino", e.getMessage());
    }
}
