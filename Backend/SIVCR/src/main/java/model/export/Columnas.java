package model.export;

import java.math.BigDecimal;
import java.util.List;
import java.util.function.Function;
import model.Etiquetas;
import model.Sinister;

/** Las columnas de un reporte de siniestros: título, cómo sacar el valor y cuánto espacio ocupa en pantalla/papel. */
final class Columnas {

    /**
     * @param ancho   caracteres que ocupa la columna (Excel y PDF)
     * @param enPdf   si va en el PDF (el papel solo alcanza para las columnas que COSEVI sí trae)
     */
    record Columna(String titulo, Function<Sinister, Object> valor, int ancho, boolean enPdf) { }

    static final List<Columna> TODAS = List.of(
        new Columna("Año", Sinister::getAnio, 4, true),
        new Columna("Mes", Sinister::getMes, 3, true),
        new Columna("Día", s -> Etiquetas.de(s.getDiaSemana()), 9, true),
        new Columna("Franja", s -> Etiquetas.de(s.getFranja()), 9, true),
        new Columna("Provincia", s -> Etiquetas.de(s.getProvincia()), 10, true),
        new Columna("Cantón", Sinister::getCanton, 20, true),
        new Columna("Distrito", Sinister::getDistrito, 22, true),
        new Columna("Ruta", Sinister::getRuta, 8, true),
        new Columna("Km", Sinister::getKm, 6, true),
        new Columna("Severidad", s -> Etiquetas.de(s.getSeveridad()), 20, true),
        new Columna("Clima", s -> Etiquetas.de(s.getClima()), 18, true),
        new Columna("Calzada", s -> Etiquetas.de(s.getCalzada()), 25, true),
        new Columna("Tipo de vehículo", s -> Etiquetas.de(s.getTipoVehiculo()), 18, false),
        new Columna("Tiempo de respuesta (min)", Sinister::getTiempoRespuestaMins, 24, false),
        new Columna("Latitud", Sinister::getLat, 11, false),
        new Columna("Longitud", Sinister::getLon, 11, false),
        new Columna("Fecha", s -> s.getFecha() == null ? null : s.getFecha().toString(), 19, false));

    private Columnas() { }

    static List<Columna> paraPdf() {
        return TODAS.stream().filter(Columna::enPdf).toList();
    }

    /** Valor como texto: vacío si es null, sin ceros ni notación científica en los decimales (12.0 -> "12"). */
    static String texto(Object valor) {
        if (valor == null) {
            return "";
        }
        if (valor instanceof Double d) {
            return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
        }
        return valor.toString();
    }
}
