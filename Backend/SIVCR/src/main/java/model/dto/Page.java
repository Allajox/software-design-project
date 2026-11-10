package model.dto;

import java.util.List;

/** Una página de resultados. La página empieza en 0. */
public record Page<T>(List<T> items, long total, int pagina, int tamano) {

    public Page {
        items = List.copyOf(items);
    }

    public long getTotalPaginas() {
        return tamano <= 0 ? 0 : (total + tamano - 1) / tamano;
    }
}
