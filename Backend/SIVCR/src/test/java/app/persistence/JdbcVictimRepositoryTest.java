package app.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.Climate;
import enums.Gender;
import enums.Province;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import java.util.List;
import model.FilterCriteria;
import model.PerfilVictimas.FatalidadPorVehiculo;
import model.PerfilVictimas.TramoEdad;
import org.junit.jupiter.api.Test;

/** Reglas puras del perfil de víctimas, sin base de datos ni Spring (corre con "mvn test"). */
class JdbcVictimRepositoryTest {

    @Test
    void lasEtiquetasDeEdadSonTramosDeCincoAniosYUnUltimoAbierto() {
        assertEquals("0-4", JdbcVictimRepository.etiquetaTramo(0));
        assertEquals("5-9", JdbcVictimRepository.etiquetaTramo(1));
        assertEquals("70-74", JdbcVictimRepository.etiquetaTramo(14));
        assertEquals("75+", JdbcVictimRepository.etiquetaTramo(15));
    }

    @Test
    void siempreHayDieciseisTramosCompletosConSuCantidadPorGenero() {
        long[] masculino = new long[16];
        long[] femenino = new long[16];
        masculino[8] = 7;
        femenino[15] = 2;

        List<TramoEdad> tramos = JdbcVictimRepository.tramos(masculino, femenino);

        assertEquals(16, tramos.size());
        assertEquals(new TramoEdad("0-4", 0, 4, 0, 0), tramos.get(0));
        assertEquals(new TramoEdad("40-44", 40, 44, 7, 0), tramos.get(8));
        assertEquals(new TramoEdad("75+", 75, null, 0, 2), tramos.get(15));
        assertNull(tramos.get(15).edadHasta());
    }

    @Test
    void laTasaDeFatalidadEsFallecidosEntrePersonasYUnGrupoVacioNoDivideEntreCero() {
        FatalidadPorVehiculo moto = JdbcVictimRepository.grupo("Motocicleta", 200, 5);
        assertEquals(0.025, moto.tasa(), 1e-12);
        assertEquals(0.0, JdbcVictimRepository.grupo("Grúa", 0, 0).tasa());
    }

    @Test
    void losFiltrosQueSoloExistenEnSiniestrosSeInformanComoNoAplicados() {
        FilterCriteria soloVictimas = new FilterCriteria(Province.SAN_JOSE, "Escazú", null, null, 2024, 3, null,
                null, null, null, null, null, 18, 30, Gender.FEMENINO);
        assertTrue(JdbcVictimRepository.filtrosNoAplicados(soloVictimas).isEmpty());

        FilterCriteria deSiniestros = new FilterCriteria(null, null, null, "27", null, null, null, TimeSlot.NOCHE,
                VehycleType.MOTOCICLETA, Severity.FALLECIDO, Climate.LLUVIA, RoadStatus.HUECOS, null, null, null);
        assertEquals(List.of("ruta", "franja", "tipoVehiculo", "severidad", "clima", "calzada"),
                JdbcVictimRepository.filtrosNoAplicados(deSiniestros));
    }
}
