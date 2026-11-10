package model;

import java.util.List;
import java.util.Set;
import model.dto.Page;

/** Puerto de lectura de siniestros. Solo devuelve registros VALIDO. La implementación vive en app.persistence. */
public interface SinisterRepository {

    /** Campos por los que se puede ordenar (lista cerrada: el texto del cliente nunca llega al SQL). */
    Set<String> CAMPOS_ORDENABLES = Set.of(
            "anio", "mes", "provincia", "canton", "distrito", "ruta", "severidad", "clima", "calzada");

    /** Todos los siniestros que calzan con el filtro (sin paginar). */
    List<Sinister> buscar(FilterCriteria criterios);

    /**
     * Una página (pagina empieza en 0). campoOrden es uno de CAMPOS_ORDENABLES, o null para ordenar por año y mes;
     * siempre se desempata por id para que las páginas no se mezclen.
     */
    Page<Sinister> buscar(FilterCriteria criterios, int pagina, int tamano, String campoOrden, boolean descendente);
}
