package model.ingestion.profile;

import enums.DataSource;
import enums.FileFormat;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import model.ingestion.TextNormalizer;
import model.ingestion.profile.FieldCatalog.Spec;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * Convierte un YAML de perfil en un MappingProfile y lo valida. Cualquier error de configuración lanza
 * IllegalArgumentException con el id/origen del perfil, de modo que la aplicación falla al arrancar
 * y no a mitad de una carga.
 */
public final class ProfileParser {

    private ProfileParser() {
    }

    public static MappingProfile leer(InputStream flujo, String origen) {
        Object raiz = new Yaml(new SafeConstructor(new LoaderOptions())).load(flujo);
        if (!(raiz instanceof Map<?, ?> mapa)) {
            throw error(origen, "el YAML debe ser un mapa en la raíz");
        }
        return construir(mapa, origen);
    }

    private static MappingProfile construir(Map<?, ?> m, String origen) {
        String id = texto(m, "id", origen, true);
        String donde = id + " (" + origen + ")";

        DataSource fuente = enumerado(DataSource.class, texto(m, "fuente", donde, true), "fuente", donde);
        RecordKind tipo = enumerado(RecordKind.class, texto(m, "tipo", donde, true), "tipo", donde);
        String descripcion = texto(m, "descripcion", donde, false);
        boolean habilitado = booleano(m, "habilitado", true);
        String motivo = texto(m, "motivoDeshabilitado", donde, false);
        String verTxt = texto(m, "verificacion", donde, false);
        MappingProfile.Verificacion verificacion = verTxt == null ? MappingProfile.Verificacion.POR_VERIFICAR
                : enumerado(MappingProfile.Verificacion.class, verTxt, "verificacion", donde);

        Set<FileFormat> formatos = EnumSet.noneOf(FileFormat.class);
        for (Object f : lista(m, "formatos")) {
            formatos.add(enumerado(FileFormat.class, String.valueOf(f), "formatos", donde));
        }
        if (formatos.isEmpty()) {
            formatos = EnumSet.allOf(FileFormat.class);
        }

        Map<?, ?> csv = submapa(m, "csv");
        String charsetTxt = csv == null ? null : texto(csv, "charset", donde, false);
        Charset charset = (charsetTxt == null || charsetTxt.equalsIgnoreCase("AUTO")) ? null : charset(charsetTxt, donde);
        String respaldoTxt = csv == null ? null : texto(csv, "fallbackCharset", donde, false);
        Charset respaldo = respaldoTxt == null ? StandardCharsets.ISO_8859_1 : charset(respaldoTxt, donde);
        String delimTxt = csv == null ? null : texto(csv, "delimiter", donde, false);
        if (delimTxt != null && delimTxt.length() != 1) {
            throw error(donde, "csv.delimiter debe ser un solo carácter");
        }
        char delimitador = delimTxt == null ? ',' : delimTxt.charAt(0);

        Map<?, ?> json = submapa(m, "json");
        String rutaJson = json == null ? null : texto(json, "recordsPath", donde, false);
        Map<?, ?> excel = submapa(m, "excel");
        String hoja = excel == null ? null : texto(excel, "sheet", donde, false);

        Set<String> desconocidos = new LinkedHashSet<>();
        for (Object o : lista(m, "valoresDesconocidos")) {
            desconocidos.add(TextNormalizer.clave(String.valueOf(o)));
        }

        Map<String, String> constantes = new LinkedHashMap<>();
        Map<?, ?> constMapa = submapa(m, "constantes");
        if (constMapa != null) {
            for (Map.Entry<?, ?> e : constMapa.entrySet()) {
                String campo = String.valueOf(e.getKey());
                Spec destino = FieldCatalog.buscar(tipo, campo).orElseThrow(
                        () -> error(donde, "constantes: el campo '" + campo + "' no existe para " + tipo));
                if (destino.destino() != FieldCatalog.Target.TEXT) {
                    throw error(donde, "constantes: solo se admiten campos de texto ('" + campo + "' no lo es)");
                }
                if (String.valueOf(e.getValue()).length() > destino.maxLongitud()) {
                    throw error(donde, "constantes: el valor de '" + campo + "' excede " + destino.maxLongitud() + " caracteres");
                }
                constantes.put(campo, String.valueOf(e.getValue()));
            }
        }

        List<RowFilter> filtros = new ArrayList<>();
        for (Object o : lista(m, "filtros")) {
            Map<?, ?> f = comoMapa(o, "filtros", donde);
            String col = texto(f, "columna", donde, true);
            String patron = texto(f, "patron", donde, true);
            filtros.add(new RowFilter(col, TextNormalizer.clave(col), Pattern.compile(patron, Pattern.CASE_INSENSITIVE)));
        }

        List<ColumnRule> columnas = new ArrayList<>();
        Set<String> camposUsados = new LinkedHashSet<>();
        Set<String> clavesUsadas = new LinkedHashSet<>();
        for (Object o : lista(m, "columnas")) {
            ColumnRule regla = columna(comoMapa(o, "columnas", donde), tipo, donde);
            if (!camposUsados.add(regla.campo())) {
                throw error(donde, "el campo '" + regla.campo() + "' está mapeado por más de una columna");
            }
            if (!clavesUsadas.add(regla.clave())) {
                throw error(donde, "la columna '" + regla.encabezado() + "' está repetida");
            }
            columnas.add(regla);
        }
        for (String campo : constantes.keySet()) {
            if (camposUsados.contains(campo)) {
                throw error(donde, "el campo '" + campo + "' es constante y también viene de una columna");
            }
        }

        // requeridos = declarados + columnas obligatorias + columnas de los filtros (sin repetir por clave)
        Map<String, String> requeridos = new LinkedHashMap<>();
        for (Object o : lista(m, "encabezadosRequeridos")) {
            requeridos.putIfAbsent(TextNormalizer.clave(String.valueOf(o)), TextNormalizer.limpiar(String.valueOf(o)));
        }
        for (ColumnRule c : columnas) {
            if (c.obligatorio()) {
                requeridos.putIfAbsent(c.clave(), c.encabezado());
            }
        }
        for (RowFilter f : filtros) {
            requeridos.putIfAbsent(f.clave(), f.encabezado());
        }

        if (habilitado) {
            if (columnas.isEmpty()) {
                throw error(donde, "un perfil habilitado necesita al menos una columna");
            }
            if (requeridos.isEmpty()) {
                throw error(donde, "un perfil habilitado necesita encabezadosRequeridos para poder reconocer el archivo");
            }
        } else if (motivo == null) {
            throw error(donde, "un perfil deshabilitado debe indicar motivoDeshabilitado");
        }

        return new MappingProfile(id, fuente, tipo, descripcion, habilitado, motivo, verificacion, formatos,
                charset, respaldo, delimitador, rutaJson, hoja, List.copyOf(requeridos.values()),
                Collections.unmodifiableSet(desconocidos), List.copyOf(columnas),
                Collections.unmodifiableMap(constantes), List.copyOf(filtros));
    }

    private static ColumnRule columna(Map<?, ?> c, RecordKind tipoRegistro, String donde) {
        String encabezado = texto(c, "columna", donde, true);
        String campo = texto(c, "campo", donde, true);
        FieldType tipo = enumerado(FieldType.class, texto(c, "tipo", donde, true), "tipo", donde + " columna '" + encabezado + "'");
        Spec spec = FieldCatalog.buscar(tipoRegistro, campo).orElseThrow(
                () -> error(donde, "columna '" + encabezado + "': el campo destino '" + campo + "' no existe para " + tipoRegistro));
        if (!tipo.compatibleCon(spec.destino())) {
            throw error(donde, "columna '" + encabezado + "': el tipo " + tipo + " no es compatible con el campo '"
                    + campo + "' (" + spec.destino() + ")");
        }

        Map<String, String> valores = new LinkedHashMap<>();
        Map<?, ?> valoresYaml = submapa(c, "valores");
        if (valoresYaml != null) {
            for (Map.Entry<?, ?> e : valoresYaml.entrySet()) {
                String canonico = String.valueOf(e.getValue());
                if (spec.destino() == FieldCatalog.Target.TEXT && canonico.length() > spec.maxLongitud()) {
                    throw error(donde, "columna '" + encabezado + "': el valor '" + canonico + "' excede " + spec.maxLongitud()
                            + " caracteres de '" + campo + "'");
                }
                valores.put(TextNormalizer.clave(String.valueOf(e.getKey())), canonico);
            }
        }
        if (tipo == FieldType.CHOICE && valores.isEmpty()) {
            throw error(donde, "columna '" + encabezado + "': el tipo CHOICE requiere el mapa 'valores'");
        }

        Set<String> vacios = new LinkedHashSet<>();
        for (Object o : lista(c, "valoresVacios")) {
            vacios.add(TextNormalizer.clave(String.valueOf(o)));
        }
        return new ColumnRule(encabezado, TextNormalizer.clave(encabezado), campo, tipo, booleano(c, "obligatorio", false),
                Collections.unmodifiableMap(valores), Collections.unmodifiableSet(vacios),
                numero(c, "min"), numero(c, "max"), entero(c, "maxLongitud"), texto(c, "formato", donde, false));
    }

    // ---- utilidades de lectura del YAML ----

    private static String texto(Map<?, ?> m, String clave, String donde, boolean obligatorio) {
        Object v = m.get(clave);
        if (v == null || String.valueOf(v).isBlank()) {
            if (obligatorio) {
                throw error(donde, "falta '" + clave + "'");
            }
            return null;
        }
        return String.valueOf(v).trim();
    }

    private static boolean booleano(Map<?, ?> m, String clave, boolean porDefecto) {
        Object v = m.get(clave);
        return v == null ? porDefecto : Boolean.parseBoolean(String.valueOf(v));
    }

    private static Double numero(Map<?, ?> m, String clave) {
        Object v = m.get(clave);
        return v == null ? null : Double.valueOf(String.valueOf(v));
    }

    private static Integer entero(Map<?, ?> m, String clave) {
        Object v = m.get(clave);
        return v == null ? null : Integer.valueOf(String.valueOf(v));
    }

    private static List<?> lista(Map<?, ?> m, String clave) {
        Object v = m.get(clave);
        return v instanceof List<?> l ? l : List.of();
    }

    private static Map<?, ?> submapa(Map<?, ?> m, String clave) {
        Object v = m.get(clave);
        return v instanceof Map<?, ?> s ? s : null;
    }

    private static Map<?, ?> comoMapa(Object o, String seccion, String donde) {
        if (o instanceof Map<?, ?> s) {
            return s;
        }
        throw error(donde, "cada elemento de '" + seccion + "' debe ser un mapa");
    }

    private static <E extends Enum<E>> E enumerado(Class<E> tipo, String valor, String campo, String donde) {
        try {
            return Enum.valueOf(tipo, valor.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw error(donde, "valor no válido '" + valor + "' en '" + campo + "'");
        }
    }

    private static Charset charset(String nombre, String donde) {
        try {
            return Charset.forName(nombre);
        } catch (RuntimeException e) {
            throw error(donde, "codificación desconocida '" + nombre + "'");
        }
    }

    private static IllegalArgumentException error(String donde, String detalle) {
        return new IllegalArgumentException("Perfil de ingesta " + donde + ": " + detalle);
    }
}
