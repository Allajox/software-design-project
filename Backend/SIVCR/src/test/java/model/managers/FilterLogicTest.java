package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.Climate;
import enums.Day;
import enums.Province;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import model.FilterCriteria;
import model.FiltroInvalidoException;
import model.FilterRepository;
import model.QueryHistory;
import model.SavedFilter;
import model.dto.Page;
import org.junit.jupiter.api.Test;

/** Lógica de filtros e historial sin base de datos ni Spring (rápida; corre con "mvn test"). */
class FilterLogicTest {

    private static FilterCriteria limonDeNoche() {
        return new FilterCriteria(Province.LIMON, "Pococí", null, null, 2023, 4, Day.SABADO, TimeSlot.NOCHE,
                null, Severity.CON_MUERTOS_O_GRAVES, Climate.LLUVIA, RoadStatus.RESBALADIZA, null, null, null);
    }

    private static FilterCriteria soloProvincia(Province p) {
        return new FilterCriteria(p, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null);
    }

    // ---- FilterCriteria ----

    @Test
    void elFiltroPasaPorJsonSinPerderCriterios() throws Exception {
        // igual que JdbcFilterRepository: solo se escriben los criterios llenados
        ObjectMapper json = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);
        FilterCriteria c = limonDeNoche();
        String texto = json.writeValueAsString(c);
        assertFalse(texto.contains("distrito"), texto);
        assertEquals(c, json.readValue(texto, FilterCriteria.class));
        assertEquals(FilterCriteria.vacio(), json.readValue("{}", FilterCriteria.class));
        assertEquals(2023, c.anio());
        assertEquals(Province.LIMON, c.provincia());
    }

    @Test
    void sinCamposNoHayFiltro() {
        assertTrue(FilterCriteria.vacio().estaVacio());
        // texto en blanco y 0 cuentan como "sin filtro": dos filtros equivalentes son iguales
        assertTrue(new FilterCriteria(null, "  ", "", null, 0, 0, null, null, null, null, null, null,
                0, 0, null).estaVacio());
        assertEquals(FilterCriteria.vacio(), new FilterCriteria(null, " ", null, null, 0, null, null, null, null,
                null, null, null, null, null, null));
        assertFalse(limonDeNoche().estaVacio());
    }

    @Test
    void rechazaRangosInvalidos() {
        FilterCriteria mes13 = new FilterCriteria(null, null, null, null, null, 13, null, null, null, null,
                null, null, null, null, null);
        FilterCriteria anio1800 = new FilterCriteria(null, null, null, null, 1800, null, null, null, null,
                null, null, null, null, null, null);
        FilterCriteria edades = new FilterCriteria(null, null, null, null, null, null, null, null, null,
                null, null, null, 30, 20, null);
        assertThrows(FiltroInvalidoException.class, mes13::validar);
        assertThrows(FiltroInvalidoException.class, anio1800::validar);
        assertThrows(FiltroInvalidoException.class, edades::validar);
        assertEquals(limonDeNoche(), limonDeNoche().validar());
    }

    @Test
    void laPaginaCuentaSusPaginas() {
        assertEquals(3, new Page<>(List.of(1, 2), 5, 0, 2).getTotalPaginas());
        assertEquals(0, new Page<>(List.of(), 0, 0, 10).getTotalPaginas());
    }

    // ---- FilterManager (validaciones que no tocan la base de datos) ----

    @Test
    void elManagerRechazaEdadYGeneroPorqueSonDeVictimas() {
        FilterManager fm = new FilterManager(null, null, null);
        FilterCriteria conEdad = fm.nuevoFiltro(null, null, null, null, 0, 0, null, null, null, null, null, null,
                14, 23, null);
        assertThrows(FiltroInvalidoException.class, () -> fm.aplicar(conEdad));
        assertThrows(FiltroInvalidoException.class, () -> fm.getRegistros(conEdad, 0, 10, null));
    }

    @Test
    void elManagerRechazaOrdenesYPaginasInvalidas() {
        FilterManager fm = new FilterManager(null, null, null);
        FilterCriteria c = fm.restablecer();
        assertThrows(FiltroInvalidoException.class, () -> fm.getRegistros(c, -1, 10, null));
        for (String orden : new String[] {"anio; DROP TABLE sinister", "id", "mes:sideways", "anio:asc:x", "anio:"}) {
            assertThrows(FiltroInvalidoException.class, () -> fm.getRegistros(c, 0, 10, orden), orden);
        }
    }

    @Test
    void elManagerRechazaNombresDeFiltroVacioOMuyLargo() {
        FilterManager fm = new FilterManager(null, null, null);
        FilterCriteria c = fm.restablecer();
        assertThrows(FiltroInvalidoException.class, () -> fm.guardarFiltro("   ", c, 1));
        assertThrows(FiltroInvalidoException.class, () -> fm.guardarFiltro(null, c, 1));
        assertThrows(FiltroInvalidoException.class, () -> fm.guardarFiltro("x".repeat(101), c, 1));
    }

    @Test
    void cadaLlamadaANuevoFiltroUsaSuPropioBuilder() {
        FilterManager fm = new FilterManager(null, null, null);
        FilterCriteria uno = fm.nuevoFiltro(Province.LIMON, null, null, null, 2023, 0, null, null, null, null, null,
                null, 0, 0, null);
        FilterCriteria dos = fm.nuevoFiltro(null, null, null, null, 0, 0, null, null, null, null, null, null, 0, 0, null);
        assertEquals(Province.LIMON, uno.provincia());
        assertEquals(2023, uno.anio());
        assertEquals(null, dos.provincia());
        assertEquals(null, dos.anio());
    }

    // ---- HistoryManager con un repositorio en memoria ----

    private static class HistorialEnMemoria implements FilterRepository {
        final List<QueryHistory> lista = new ArrayList<>();
        final List<String> resumenes = new ArrayList<>();

        @Override
        public SavedFilter guardar(long usuarioId, String nombre, FilterCriteria criterio) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<SavedFilter> listar(long usuarioId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void registrar(long usuarioId, String resumen, FilterCriteria criterio) {
            resumenes.add(resumen);
            lista.add(0, new QueryHistory((long) lista.size() + 1, LocalDateTime.now(), resumen, criterio));
        }

        @Override
        public List<QueryHistory> recientes(long usuarioId, int limite) {
            return lista.subList(0, Math.min(limite, lista.size()));
        }

        @Override
        public Optional<QueryHistory> buscar(long usuarioId, long id) {
            return lista.stream().filter(h -> h.id() == id).findFirst();
        }
    }

    @Test
    void elHistorialNoGuardaConsultasVaciasNiRepiteLaUltima() {
        HistorialEnMemoria repo = new HistorialEnMemoria();
        HistoryManager historial = new HistoryManager(repo);

        historial.registrar(2, new FilterManager(null, null, null).restablecer());
        assertEquals(0, repo.resumenes.size(), "una consulta sin filtros no se registra");

        historial.registrar(2, limonDeNoche());
        historial.registrar(2, limonDeNoche());
        assertEquals(1, repo.resumenes.size(), "la misma consulta seguida no se repite");

        historial.registrar(2, soloProvincia(Province.CARTAGO));
        assertEquals(2, repo.resumenes.size());

        historial.registrar(2, limonDeNoche());
        assertEquals(3, repo.resumenes.size(), "volver a una consulta anterior sí se registra");
    }

    @Test
    void elResumenEsLegible() {
        String resumen = HistoryManager.resumen(limonDeNoche());
        assertEquals("Limon, Pococí, 2023, mes 4, Sabado, Noche, Con muertos o graves, Lluvia, Resbaladiza", resumen);
    }
}
