package model;

import java.util.List;
import java.util.Set;
import model.dto.Page;

/** Puerto de lectura de siniestros. Solo devuelve registros VALIDO. La implementación vive en app.persistence. */
public interface SinisterRepository {

    /** Campos por los que se puede ordenar (lista cerrada: el texto del cliente nunca llega al SQL). */
    Set<String> CAMPOS_ORDENABLES = Set.of(
            "anio", "mes", "provincia", "canton", "distrito", "ruta", "severidad", "clima", "calzada");

    /** Cuántos campos como máximo se pueden combinar en un orden (ej. año, mes, provincia). */
    int MAX_NIVELES_DE_ORDEN = 4;

    /** Un nivel del orden: el campo (uno de CAMPOS_ORDENABLES) y su sentido. */
    record Orden(String campo, boolean descendente) { }

    /** Todos los siniestros que calzan con el filtro (sin paginar). */
    List<Sinister> buscar(FilterCriteria criterios);

    /**
     * Una página (pagina empieza en 0). orden lleva los niveles en el orden en que se aplican (el primero manda);
     * vacío ordena por año y mes. Siempre se desempata por id para que las páginas no se mezclen.
     */
    Page<Sinister> buscar(FilterCriteria criterios, int pagina, int tamano, List<Orden> orden);
}
