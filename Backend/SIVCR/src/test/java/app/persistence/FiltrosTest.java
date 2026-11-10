package app.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.Climate;
import enums.Gender;
import enums.Province;
import enums.TimeSlot;
import java.util.List;
import model.FilterCriteria;
import model.SinisterRepository.Orden;
import model.StatsRepository.Alcance;
import org.junit.jupiter.api.Test;

/** Qué filtros entran en cada WHERE y cómo se arma el ORDER BY, sin base de datos (corre con "mvn test"). */
class FiltrosTest {

    // provincia, cantón, ruta, año, franja, clima, edad mínima y género: un poco de cada tipo
    private static final FilterCriteria MIXTO = new FilterCriteria(Province.LIMON, "Pococí", null, "32", 2023, null,
            null, TimeSlot.NOCHE, null, null, Climate.LLUVIA, null, 18, null, Gender.FEMENINO);

    @Test
    void laTablaDeRegistrosAplicaTodosLosFiltrosDeSiniestrosYNingunoDePersonas() {
        Filtros.Consulta q = Filtros.siniestros(MIXTO);
        for (String columna : List.of("provincia", "canton", "ruta", "anio", "franja", "clima")) {
            assertTrue(q.where().contains(columna + " = :"), columna + " en " + q.where());
        }
        assertFalse(q.where().contains("edad"), q.where());
        assertFalse(q.where().contains("genero"), q.where());
        assertFalse(q.where().contains("fuenteKpi"), "la tabla muestra todas las fuentes: " + q.where());
        assertTrue(q.where().startsWith(" WHERE calidad = 'VALIDO'"));
    }

    @Test
    void losKpiSoloCuentanSiniestrosDeLaFuenteDeKpi() {
        for (Alcance alcance : Alcance.values()) {
            Filtros.Consulta q = Filtros.siniestrosParaKpi(MIXTO, alcance);
            assertTrue(q.where().contains("FROM ingestion_log WHERE fuente = :fuenteKpi"), q.where());
            assertEquals("COSEVI", q.parametros().getValue("fuenteKpi"));
            assertTrue(q.where().contains("calidad = 'VALIDO'"));
        }
    }

    @Test
    void sinGeografiaSeIgnoranProvinciaCantonDistritoYRutaPeroNoElTiempoNiElDetalle() {
        String where = Filtros.siniestrosParaKpi(MIXTO, Alcance.SIN_GEOGRAFIA).where();
        for (String ignorado : List.of("provincia", "canton", "distrito", "ruta")) {
            assertFalse(where.contains(ignorado + " = :"), ignorado + " en " + where);
        }
        for (String aplicado : List.of("anio", "franja", "clima")) {
            assertTrue(where.contains(aplicado + " = :"), aplicado + " en " + where);
        }
    }

    @Test
    void ubicacionYTiempoEsLoQueComparteConLasPersonas() {
        String where = Filtros.siniestrosParaKpi(MIXTO, Alcance.COMUN_CON_PERSONAS).where();
        for (String aplicado : List.of("provincia", "canton", "anio")) {
            assertTrue(where.contains(aplicado + " = :"), aplicado + " en " + where);
        }
        for (String ignorado : List.of("ruta", "franja", "clima")) {
            assertFalse(where.contains(ignorado + " = :"), ignorado + " en " + where);
        }
    }

    @Test
    void lasPersonasAplicanUbicacionTiempoEdadYGenero() {
        String where = Filtros.personas(MIXTO).where();
        for (String aplicado : List.of("provincia = :", "canton = :", "anio = :", "edad >= :edadMin", "genero = :")) {
            assertTrue(where.contains(aplicado), aplicado + " en " + where);
        }
        for (String ignorado : List.of("ruta", "franja", "clima")) {
            assertFalse(where.contains(ignorado), ignorado + " en " + where);
        }
    }

    @Test
    void lasPersonasSinEdadNiGeneroSoloAplicanUbicacionYTiempo() {
        String where = Filtros.personasSinEdadNiGenero(MIXTO).where();
        assertTrue(where.contains("provincia = :"));
        assertFalse(where.contains("edad"));
        assertFalse(where.contains("genero"));
    }

    @Test
    void sinFiltrosSoloQuedaLaCondicionDeCalidad() {
        assertEquals(" WHERE calidad = 'VALIDO'", Filtros.siniestros(FilterCriteria.vacio()).where());
        assertEquals(" WHERE calidad = 'VALIDO'", Filtros.personas(FilterCriteria.vacio()).where());
    }

    @Test
    void elValorDelUsuarioNuncaVaEnElSql() {
        FilterCriteria malicioso = new FilterCriteria(null, "x'; DROP TABLE sinister; --", null, null, null, null,
                null, null, null, null, null, null, null, null, null);
        Filtros.Consulta q = Filtros.siniestros(malicioso);
        assertFalse(q.where().contains("DROP"), q.where());
        assertEquals("x'; DROP TABLE sinister; --", q.parametros().getValue("canton"));
    }

    // ---- ORDER BY ----

    @Test
    void sinOrdenSeUsaAnioMesEId() {
        assertEquals(" ORDER BY anio, mes, id", JdbcSinisterRepository.clausulaOrden(null));
        assertEquals(" ORDER BY anio, mes, id", JdbcSinisterRepository.clausulaOrden(List.of()));
    }

    @Test
    void varioNivelesSeEscribenEnOrdenConElIdAlFinalYLosVaciosAlFinal() {
        assertEquals(" ORDER BY anio DESC NULLS LAST, mes ASC NULLS LAST, provincia ASC NULLS LAST, id",
                JdbcSinisterRepository.clausulaOrden(
                        List.of(new Orden("anio", true), new Orden("mes", false), new Orden("provincia", false))));
    }

    @Test
    void unCampoQueNoEstaEnLaListaCerradaNuncaLlegaAlSql() {
        assertThrows(IllegalArgumentException.class, () -> JdbcSinisterRepository.clausulaOrden(
                List.of(new Orden("anio; DROP TABLE sinister", false))));
    }
}
