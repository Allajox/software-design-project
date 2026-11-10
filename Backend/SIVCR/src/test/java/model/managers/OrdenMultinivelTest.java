package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import model.FiltroInvalidoException;
import model.SinisterRepository.Orden;
import org.junit.jupiter.api.Test;

/** Lectura del parámetro sort de la tabla de registros (HU 20): varios campos, cada uno con su sentido. */
class OrdenMultinivelTest {

    @Test
    void sinOrdenNoHayNiveles() {
        assertTrue(FilterManager.ordenar(null).isEmpty());
        assertTrue(FilterManager.ordenar("  ").isEmpty());
    }

    @Test
    void unCampoSoloOConSentidoSigueFuncionando() {
        assertEquals(List.of(new Orden("anio", false)), FilterManager.ordenar("anio"));
        assertEquals(List.of(new Orden("provincia", true)), FilterManager.ordenar("provincia:desc"));
    }

    @Test
    void varioCamposSeAplicanEnElOrdenEscrito() {
        assertEquals(List.of(new Orden("anio", true), new Orden("mes", false), new Orden("provincia", false)),
                FilterManager.ordenar("anio:desc,mes,provincia:asc"));
    }

    @Test
    void ignoraMayusculasYEspacios() {
        assertEquals(List.of(new Orden("anio", true), new Orden("mes", false)),
                FilterManager.ordenar(" Anio : DESC , mes "));
    }

    @Test
    void rechazaCamposDesconocidosYSentidosRaros() {
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("password"));
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("anio:arriba"));
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("anio:desc:mes"));
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("anio; DROP TABLE sinister"));
    }

    @Test
    void rechazaNivelesVaciosYCamposRepetidos() {
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("anio,,mes"));
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("anio,"));
        FiltroInvalidoException repetido = assertThrows(FiltroInvalidoException.class,
                () -> FilterManager.ordenar("anio,mes,anio:desc"));
        assertTrue(repetido.getMessage().contains("anio"), repetido.getMessage());
    }

    @Test
    void admiteComoMuchoCuatroNiveles() {
        assertEquals(4, FilterManager.ordenar("anio,mes,provincia,canton").size());
        assertThrows(FiltroInvalidoException.class, () -> FilterManager.ordenar("anio,mes,provincia,canton,distrito"));
    }
}
