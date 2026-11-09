package model.ingestion.parser;

import enums.FileFormat;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Consumer;
import javax.xml.parsers.ParserConfigurationException;
import model.ingestion.IngestionException;
import model.ingestion.ParseOptions;
import model.ingestion.SinisterBruteData;
import model.ingestion.TextNormalizer;
import model.ingestion.UploadedFile;
import org.apache.poi.openxml4j.exceptions.OpenXML4JException;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.util.XMLHelper;
import org.apache.poi.xssf.eventusermodel.ReadOnlySharedStringsTable;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.xssf.usermodel.XSSFComment;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;

/**
 * Lector de Excel (.xlsx) por eventos (SAX) de Apache POI: no construye el libro completo en memoria.
 * Lee la hoja indicada por el perfil o, si no hay, la primera. La fila 1 es el encabezado.
 * Los valores se toman con el formato con que se ven en Excel (DataFormatter).
 */
public class ExcelParser implements FileParser {

    @Override
    public FileFormat formato() {
        return FileFormat.EXCEL;
    }

    @Override
    public List<String> leerEncabezados(UploadedFile archivo, ParseOptions opciones) throws IOException {
        Lector lector = new Lector(true, fila -> { });
        leer(archivo, opciones, lector);
        if (lector.encabezados == null) {
            throw new IngestionException("La hoja de Excel está vacía.");
        }
        return lector.encabezados;
    }

    @Override
    public void parse(UploadedFile archivo, ParseOptions opciones, Consumer<SinisterBruteData> destino)
            throws IOException {
        Lector lector = new Lector(false, destino);
        leer(archivo, opciones, lector);
        if (lector.encabezados == null) {
            throw new IngestionException("La hoja de Excel está vacía.");
        }
    }

    private void leer(UploadedFile archivo, ParseOptions opciones, Lector lector) throws IOException {
        // OPCPackage necesita un archivo (con un flujo cargaría todo el paquete en memoria)
        Path temporal = Files.createTempFile("sivcr-ingesta-", ".xlsx");
        try {
            try (InputStream in = archivo.open()) {
                Files.copy(in, temporal, StandardCopyOption.REPLACE_EXISTING);
            }
            try (OPCPackage paquete = OPCPackage.open(temporal.toFile(), PackageAccess.READ)) {
                XSSFReader lectorXlsx = new XSSFReader(paquete);
                ReadOnlySharedStringsTable cadenas = new ReadOnlySharedStringsTable(paquete);
                StylesTable estilos = lectorXlsx.getStylesTable();
                String buscada = opciones.sheetName();
                boolean sinNombre = buscada == null || buscada.isBlank();

                XSSFReader.SheetIterator hojas = (XSSFReader.SheetIterator) lectorXlsx.getSheetsData();
                InputStream hoja = null;
                while (hojas.hasNext()) {
                    InputStream candidata = hojas.next();
                    if (sinNombre || buscada.equalsIgnoreCase(hojas.getSheetName())) {
                        hoja = candidata;
                        break;
                    }
                    candidata.close();
                }
                if (hoja == null) {
                    throw new IngestionException("No se encontró la hoja '" + buscada + "' en el libro de Excel.");
                }
                try (InputStream h = hoja) {
                    XMLReader xml = XMLHelper.newXMLReader();
                    xml.setContentHandler(new XSSFSheetXMLHandler(estilos, cadenas, lector, new DataFormatter(), false));
                    xml.parse(new InputSource(h));
                } catch (ParadaLectura parada) {
                    // se leyó lo necesario (solo encabezados)
                } catch (SAXException e) {
                    if (!(e.getCause() instanceof ParadaLectura) && !(e.getException() instanceof ParadaLectura)) {
                        throw new IngestionException("No se pudo leer la hoja de Excel (XML inválido).", e);
                    }
                }
            } catch (OpenXML4JException | ParserConfigurationException | SAXException e) {
                throw new IngestionException("El archivo no es un libro de Excel (.xlsx) válido.", e);
            }
        } catch (IngestionException e) {
            throw e;
        } catch (RuntimeException e) {
            if (e instanceof ParadaLectura) {
                return;
            }
            // errores del consumidor (por ejemplo de base de datos) no deben disfrazarse de "Excel inválido",
            // pero un XML/zip roto de POI sí
            if (e.getClass().getName().startsWith("org.apache.poi")) {
                throw new IngestionException("El archivo no es un libro de Excel (.xlsx) válido.", e);
            }
            throw e;
        } finally {
            Files.deleteIfExists(temporal);
        }
    }

    /** Señal interna para cortar la lectura al tener los encabezados. */
    private static final class ParadaLectura extends RuntimeException {
        private static final long serialVersionUID = 1L;

        ParadaLectura() {
            super(null, null, false, false);
        }
    }

    private static final class Lector implements XSSFSheetXMLHandler.SheetContentsHandler {

        private final boolean soloEncabezados;
        private final Consumer<SinisterBruteData> destino;
        private final TreeMap<Integer, String> celdas = new TreeMap<>();
        private int ultimaColumna = -1;

        List<String> encabezados;
        private List<String> claves;

        Lector(boolean soloEncabezados, Consumer<SinisterBruteData> destino) {
            this.soloEncabezados = soloEncabezados;
            this.destino = destino;
        }

        @Override
        public void startRow(int numeroFila) {
            celdas.clear();
            ultimaColumna = -1;
        }

        @Override
        public void cell(String referencia, String valor, XSSFComment comentario) {
            int columna = referencia != null ? new CellReference(referencia).getCol() : ultimaColumna + 1;
            ultimaColumna = columna;
            celdas.put(columna, TextNormalizer.limpiar(valor));
        }

        @Override
        public void endRow(int numeroFila) {
            boolean vacia = celdas.values().stream().allMatch(String::isEmpty);
            if (vacia) {
                return;
            }
            int maxColumna = celdas.lastKey();
            if (encabezados == null) {
                encabezados = new ArrayList<>();
                claves = new ArrayList<>();
                for (int i = 0; i <= maxColumna; i++) {
                    String texto = celdas.getOrDefault(i, "");
                    encabezados.add(texto);
                    claves.add(TextNormalizer.clave(texto));
                }
                if (soloEncabezados) {
                    throw new ParadaLectura();
                }
                return;
            }
            Map<String, String> valores = new LinkedHashMap<>();
            for (int i = 0; i < claves.size(); i++) {
                valores.put(claves.get(i), celdas.getOrDefault(i, ""));
            }
            boolean malformada = maxColumna >= claves.size();
            destino.accept(new SinisterBruteData(numeroFila + 1, valores, malformada));
        }

        // Ambas versiones de POI declaran este método; no se usa @Override para no depender de ello.
        public void headerFooter(String texto, boolean esCabecera, String etiqueta) {
        }
    }
}
