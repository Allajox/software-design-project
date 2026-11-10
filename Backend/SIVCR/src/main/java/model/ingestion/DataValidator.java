package model.ingestion;

import enums.QualityStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import model.ingestion.profile.FieldCatalog.Spec;
import model.ingestion.profile.FieldCatalog.Target;
import model.ingestion.profile.FieldCatalog;
import model.ingestion.profile.MappingProfile.ColumnRule;
import model.ingestion.profile.MappingProfile.RowFilter;
import model.ingestion.profile.MappingProfile;
import model.ingestion.profile.RecordKind;

/**
 * Valida y normaliza filas según el perfil de mapeo de la fuente (HU 2).
 *
 * Clasificación de cada fila:
 *  - CORRUPTO:   hay un valor que no se puede interpretar (tipo, rango, valor fuera de la lista, longitud),
 *                coordenadas fuera de Costa Rica o incoherentes, hora y franja que no coinciden, o la fila
 *                no tiene las columnas del encabezado.
 *  - INCOMPLETO: no hay dato corrupto, pero falta (o viene como "Desconocido"/"Ignorado") un campo obligatorio.
 *  - VALIDO:     todo lo demás. Un dato desconocido en un campo opcional no resta calidad.
 *
 * Los mensajes dicen fila, columna y motivo, nunca el contenido de la celda.
 */
public class DataValidator {

    private static final Pattern HORA = Pattern.compile("^(\\d{1,2}):(\\d{2})(?:\\s*-\\s*\\d{1,2}:\\d{2})?$");
    private static final Pattern PREFIJO_DIA = Pattern.compile("^\\d+\\s*[.\\-]?\\s*");
    private static final Pattern PREFIJO_MES = Pattern.compile("^[a-z]\\s*\\.\\s*");
    private static final Pattern ENTERO_CON_DECIMALES_CERO = Pattern.compile("^(\\d+)\\.0+$");

    private static final Map<String, String> DIAS = Map.of(
            "lunes", "LUNES", "martes", "MARTES", "miercoles", "MIERCOLES", "jueves", "JUEVES",
            "viernes", "VIERNES", "sabado", "SABADO", "domingo", "DOMINGO");

    private static final Map<String, Integer> MESES = Map.ofEntries(
            Map.entry("enero", 1), Map.entry("febrero", 2), Map.entry("marzo", 3), Map.entry("abril", 4),
            Map.entry("mayo", 5), Map.entry("junio", 6), Map.entry("julio", 7), Map.entry("agosto", 8),
            Map.entry("setiembre", 9), Map.entry("septiembre", 9), Map.entry("octubre", 10),
            Map.entry("noviembre", 11), Map.entry("diciembre", 12));

    private enum Estado { OK, AUSENTE, INVALIDO }

    private record Lectura(Estado estado, Object valor, String motivo) {
    }

    private static final class ValorInvalido extends RuntimeException {
        private static final long serialVersionUID = 1L;

        ValorInvalido(String motivo) {
            super(motivo, null, false, false);
        }
    }

    private final MappingProfile perfil;
    private final GeoBounds limites;

    public DataValidator(MappingProfile perfil, GeoBounds limites) {
        this.perfil = perfil;
        this.limites = limites;
    }

    /** Firma del diagrama de clases. */
    public QualityStatus validar(SinisterBruteData registro) {
        return evaluar(registro).estado();
    }

    /** Firma del diagrama de clases: true si la coordenada está dentro del ámbito geográfico de Costa Rica. */
    public boolean validarCoord(double lat, double lon) {
        return limites.contiene(lat, lon);
    }

    public ValidationResult evaluar(SinisterBruteData registro) {
        String prefijo = "Fila " + registro.fila() + ": ";
        if (registro.malformada()) {
            return new ValidationResult(QualityStatus.CORRUPTO, false, Map.of(),
                    List.of(prefijo + "la cantidad de columnas no coincide con la del encabezado."));
        }
        for (RowFilter filtro : perfil.filtros()) {
            if (!filtro.acepta(registro.valor(filtro.clave()))) {
                return ValidationResult.omitida();
            }
        }

        Map<String, Object> campos = new LinkedHashMap<>();
        List<String> errores = new ArrayList<>();
        Set<String> camposInvalidos = new HashSet<>();
        boolean corrupto = false;
        boolean incompleto = false;

        for (ColumnRule columna : perfil.columnas()) {
            Lectura lectura = interpretar(columna, registro.valor(columna.clave()));
            switch (lectura.estado()) {
                case OK -> campos.put(columna.campo(), lectura.valor());
                case AUSENTE -> {
                    if (columna.obligatorio()) {
                        incompleto = true;
                        errores.add(prefijo + "falta el dato obligatorio '" + columna.encabezado() + "'.");
                    }
                }
                case INVALIDO -> {
                    corrupto = true;
                    camposInvalidos.add(columna.campo());
                    errores.add(prefijo + "valor no válido en '" + columna.encabezado() + "' (" + lectura.motivo() + ").");
                }
            }
        }
        perfil.constantes().forEach(campos::putIfAbsent);

        if (perfil.tipo() == RecordKind.SINISTER) {
            corrupto |= revisarCoordenadas(campos, camposInvalidos, errores, prefijo);
            corrupto |= revisarHoraFranja(campos, camposInvalidos, errores, prefijo);
        }

        QualityStatus estado = corrupto ? QualityStatus.CORRUPTO
                : incompleto ? QualityStatus.INCOMPLETO : QualityStatus.VALIDO;
        return new ValidationResult(estado, false, campos, errores);
    }

    private boolean revisarCoordenadas(Map<String, Object> campos, Set<String> invalidos, List<String> errores,
                                       String prefijo) {
        if (invalidos.contains("lat") || invalidos.contains("lon")) {
            return false; // ya se reportó el valor inválido
        }
        boolean hayLat = campos.get("lat") instanceof Double;
        boolean hayLon = campos.get("lon") instanceof Double;
        if (hayLat != hayLon) {
            errores.add(prefijo + "la latitud y la longitud deben venir juntas.");
            return true;
        }
        if (hayLat && !validarCoord((Double) campos.get("lat"), (Double) campos.get("lon"))) {
            errores.add(prefijo + "las coordenadas están fuera del ámbito geográfico de Costa Rica.");
            return true;
        }
        return false;
    }

    private boolean revisarHoraFranja(Map<String, Object> campos, Set<String> invalidos, List<String> errores,
                                      String prefijo) {
        if (invalidos.contains("hora") || invalidos.contains("franja")) {
            return false;
        }
        if (campos.get("hora") instanceof Number hora && campos.get("franja") instanceof String franja
                && !franjaDe(hora.intValue()).equals(franja)) {
            errores.add(prefijo + "la hora y la franja horaria no coinciden.");
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Interpretación de una celda
    // ------------------------------------------------------------------

    private Lectura interpretar(ColumnRule columna, String crudo) {
        String limpio = TextNormalizer.limpiar(crudo);
        if (limpio.isEmpty()) {
            return new Lectura(Estado.AUSENTE, null, null);
        }
        String clave = TextNormalizer.clave(limpio);
        if (perfil.valoresDesconocidos().contains(clave) || columna.tokensVacios().contains(clave)) {
            return new Lectura(Estado.AUSENTE, null, null);
        }
        Spec spec = FieldCatalog.buscar(perfil.tipo(), columna.campo()).orElseThrow();
        try {
            return new Lectura(Estado.OK, convertir(columna, spec, limpio, clave), null);
        } catch (ValorInvalido e) {
            return new Lectura(Estado.INVALIDO, null, e.getMessage());
        } catch (ArithmeticException e) {
            return new Lectura(Estado.INVALIDO, null, "número fuera de rango");
        }
    }

    private Object convertir(ColumnRule c, Spec spec, String texto, String clave) {
        switch (c.tipo()) {
            case STRING -> {
                int max = c.maxLongitud() != null ? Math.min(c.maxLongitud(), spec.maxLongitud()) : spec.maxLongitud();
                if (texto.length() > max) {
                    throw new ValorInvalido("excede la longitud máxima de " + max + " caracteres");
                }
                return texto;
            }
            case CHOICE -> {
                String canonico = c.valores().get(clave);
                if (canonico == null) {
                    Matcher m = ENTERO_CON_DECIMALES_CERO.matcher(clave);
                    if (m.matches()) {
                        canonico = c.valores().get(m.group(1));
                    }
                }
                if (canonico == null) {
                    throw new ValorInvalido("valor no reconocido");
                }
                return canonico;
            }
            case INTEGER -> {
                BigDecimal bd = numero(texto);
                if (bd.stripTrailingZeros().scale() > 0) {
                    throw new ValorInvalido("no es un número entero");
                }
                return numeroEnDestino(c, spec, bd.longValueExact());
            }
            case HOUR_RANGE -> {
                Matcher m = HORA.matcher(texto);
                if (!m.matches()) {
                    throw new ValorInvalido("formato de hora no reconocido");
                }
                int hora = Integer.parseInt(m.group(1));
                int minuto = Integer.parseInt(m.group(2));
                if (hora > 23 || minuto > 59) {
                    throw new ValorInvalido("hora fuera de rango");
                }
                return numeroEnDestino(c, spec, hora);
            }
            case TIME_BAND_RANGE -> {
                Matcher m = HORA.matcher(texto);
                if (!m.matches()) {
                    throw new ValorInvalido("formato de franja horaria no reconocido");
                }
                int hora = Integer.parseInt(m.group(1));
                if (hora > 23) {
                    throw new ValorInvalido("hora fuera de rango");
                }
                return franjaDe(hora);
            }
            case WEEKDAY_LABEL -> {
                String dia = DIAS.get(PREFIJO_DIA.matcher(clave).replaceFirst(""));
                if (dia == null) {
                    throw new ValorInvalido("día de la semana no reconocido");
                }
                return dia;
            }
            case MONTH_LABEL -> {
                String nombre = PREFIJO_MES.matcher(clave).replaceFirst("");
                Integer mes = nombre.matches("\\d{1,2}") ? Integer.valueOf(nombre) : MESES.get(nombre);
                if (mes == null) {
                    throw new ValorInvalido("mes no reconocido");
                }
                return numeroEnDestino(c, spec, mes);
            }
            case DECIMAL, LATITUDE, LONGITUDE -> {
                double d = numero(texto).doubleValue();
                if (Double.isNaN(d) || Double.isInfinite(d)) {
                    throw new ValorInvalido("no es un número válido");
                }
                verificarRango(c, spec, d);
                return d;
            }
            case DATE -> {
                return fecha(texto, c.formato());
            }
        }
        throw new IllegalStateException("Tipo no soportado: " + c.tipo());
    }

    private static BigDecimal numero(String texto) {
        String t = texto;
        if (t.indexOf(',') >= 0 && t.indexOf('.') < 0) {
            t = t.replace(',', '.');
        }
        try {
            return new BigDecimal(t);
        } catch (NumberFormatException e) {
            throw new ValorInvalido("no es un número");
        }
    }

    private static Object numeroEnDestino(ColumnRule c, Spec spec, long valor) {
        verificarRango(c, spec, valor);
        return spec.destino() == Target.SHORT ? (Object) (short) valor : (Object) (int) valor;
    }

    private static void verificarRango(ColumnRule c, Spec spec, double valor) {
        Double min = mayor(spec.min(), c.min());
        Double max = menor(spec.max(), c.max());
        if ((min != null && valor < min) || (max != null && valor > max)) {
            throw new ValorInvalido("fuera del rango permitido");
        }
    }

    private static Double mayor(Double a, Double b) {
        return a == null ? b : b == null ? a : Double.valueOf(Math.max(a, b));
    }

    private static Double menor(Double a, Double b) {
        return a == null ? b : b == null ? a : Double.valueOf(Math.min(a, b));
    }

    private static LocalDateTime fecha(String texto, String formato) {
        try {
            if (formato != null) {
                TemporalAccessor t = DateTimeFormatter.ofPattern(formato)
                        .parseBest(texto, LocalDateTime::from, LocalDate::from);
                return t instanceof LocalDateTime dt ? dt : ((LocalDate) t).atStartOfDay();
            }
            try {
                return LocalDateTime.parse(texto);
            } catch (java.time.format.DateTimeParseException e) {
                return LocalDate.parse(texto).atStartOfDay();
            }
        } catch (RuntimeException e) {
            throw new ValorInvalido("fecha con formato no válido");
        }
    }

    static String franjaDe(int hora) {
        if (hora < 6) {
            return "MADRUGADA";
        }
        if (hora < 12) {
            return "MANANA";
        }
        return hora < 18 ? "TARDE" : "NOCHE";
    }
}
