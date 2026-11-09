package model.ingestion;

/**
 * Límites geográficos de Costa Rica (incluye la Isla del Coco). Es un rectángulo aproximado, no el contorno
 * del país: acepta puntos en el mar o en los países vecinos cercanos a la frontera, pero rechaza
 * coordenadas sin signo, invertidas, en (0,0) o de otro continente, que son los errores típicos de captura.
 */
public record GeoBounds(double latMin, double latMax, double lonMin, double lonMax) {

    public static final GeoBounds COSTA_RICA = new GeoBounds(5.40, 11.30, -87.20, -82.50);

    public boolean contiene(double lat, double lon) {
        return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
    }
}
