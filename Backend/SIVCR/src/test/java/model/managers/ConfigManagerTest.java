package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import model.ConfigStore;
import model.FiltroInvalidoException;
import model.SystemConfig;
import model.dto.ConfigDto;
import org.junit.jupiter.api.Test;

/** Validación y guardado de la configuración global (HU 30) sin base de datos ni Spring. */
class ConfigManagerTest {

    /** Almacén en memoria: recuerda lo último que se guardó y quién lo guardó. */
    private static class Almacen implements ConfigStore {
        SystemConfig vigente = new SystemConfig(10, 5, 1, Set.of("LLUVIA", "NEBLINA"), Set.of("HUECOS"));
        Long usuario;
        int guardados;

        @Override public SystemConfig leer() { return vigente; }
        @Override public void guardar(SystemConfig config, long usuarioId) {
            vigente = config;
            usuario = usuarioId;
            guardados++;
        }
    }

    private final Almacen almacen = new Almacen();
    private final ConfigManager manager = new ConfigManager(almacen);

    private static ConfigDto dto(Double w1, Double w2, Double w3, List<String> clima, List<String> calzada) {
        return new ConfigDto(w1, w2, w3, clima, calzada);
    }

    private static ConfigDto valido() {
        return dto(100.0, 20.0, 2.0, List.of("LLUVIA"), List.of("RESBALADIZA", "HUECOS"));
    }

    private void rechaza(ConfigDto pedido, String fragmentoDelMensaje) {
        FiltroInvalidoException e = assertThrows(FiltroInvalidoException.class, () -> manager.actualizar(pedido, 7));
        assertTrue(e.getMessage().contains(fragmentoDelMensaje), e.getMessage());
        assertEquals(0, almacen.guardados, "un pedido inválido no debe guardar nada");
        assertNull(almacen.usuario);
    }

    @Test
    void obtenerDevuelveLoVigenteConLasListasOrdenadas() {
        almacen.vigente = new SystemConfig(10, 5, 1, Set.of("NEBLINA", "LLUVIA", "LLUVIA_CON_NEBLINA"), Set.of());
        ConfigDto c = manager.obtener();
        assertEquals(10.0, c.wFallecido());
        assertEquals(5.0, c.wHeridoGrave());
        assertEquals(1.0, c.wHeridoLeve());
        assertEquals(List.of("LLUVIA", "LLUVIA_CON_NEBLINA", "NEBLINA"), c.climaAdverso());
        assertEquals(List.of(), c.calzadaAdversa());
    }

    @Test
    void guardaLaConfiguracionValidaANombreDelUsuarioYDevuelveLoGuardado() {
        ConfigDto guardada = manager.actualizar(valido(), 7);
        assertEquals(1, almacen.guardados);
        assertEquals(7L, almacen.usuario);
        assertEquals(100.0, almacen.vigente.wFallecido());
        assertEquals(20.0, almacen.vigente.wHeridoGrave());
        assertEquals(2.0, almacen.vigente.wHeridoLeve());
        assertEquals(Set.of("LLUVIA"), almacen.vigente.climaAdverso());
        assertEquals(Set.of("HUECOS", "RESBALADIZA"), almacen.vigente.calzadaAdversa());
        assertEquals(List.of("HUECOS", "RESBALADIZA"), guardada.calzadaAdversa());
    }

    @Test
    void reemplazaTodoPorqueEsUnPutCompleto() {
        manager.actualizar(dto(1.0, 1.0, 1.0, List.of(), List.of()), 7);
        assertEquals(Set.of(), almacen.vigente.climaAdverso());
        assertEquals(Set.of(), almacen.vigente.calzadaAdversa());
    }

    @Test
    void normalizaMayusculasEspaciosYRepetidos() {
        manager.actualizar(dto(10.0, 5.0, 1.0, List.of(" lluvia ", "LLUVIA", "neblina"), List.of()), 7);
        assertEquals(Set.of("LLUVIA", "NEBLINA"), almacen.vigente.climaAdverso());
    }

    @Test
    void aceptaDosDecimalesYCeroEnUnPesoSiOtroEsPositivo() {
        manager.actualizar(dto(12.5, 0.0, 0.25, List.of(), List.of()), 7);
        assertEquals(12.5, almacen.vigente.wFallecido());
        assertEquals(0.0, almacen.vigente.wHeridoGrave());
        assertEquals(0.25, almacen.vigente.wHeridoLeve());
    }

    @Test
    void rechazaPesosFaltantes() {
        rechaza(dto(null, 5.0, 1.0, List.of(), List.of()), "wFallecido");
        rechaza(dto(10.0, null, 1.0, List.of(), List.of()), "wHeridoGrave");
        rechaza(dto(10.0, 5.0, null, List.of(), List.of()), "wHeridoLeve");
    }

    @Test
    void rechazaPesosNegativosNoNumericosOFueraDeRango() {
        rechaza(dto(-1.0, 5.0, 1.0, List.of(), List.of()), "negativo");
        rechaza(dto(10.0, Double.NaN, 1.0, List.of(), List.of()), "número válido");
        rechaza(dto(10.0, 5.0, Double.POSITIVE_INFINITY, List.of(), List.of()), "número válido");
        rechaza(dto(1_000_000.0, 5.0, 1.0, List.of(), List.of()), "999999.99");
    }

    @Test
    void rechazaMasDeDosDecimalesEnVezDeRedondearEnSilencio() {
        rechaza(dto(10.005, 5.0, 1.0, List.of(), List.of()), "2 decimales");
    }

    @Test
    void rechazaTodosLosPesosEnCero() {
        rechaza(dto(0.0, 0.0, 0.0, List.of(), List.of()), "Al menos un peso");
    }

    @Test
    void rechazaListasFaltantes() {
        rechaza(dto(10.0, 5.0, 1.0, null, List.of()), "climaAdverso");
        rechaza(dto(10.0, 5.0, 1.0, List.of(), null), "calzadaAdversa");
    }

    @Test
    void rechazaValoresQueNoSonDeLosEnumsYListaLosPermitidos() {
        rechaza(dto(10.0, 5.0, 1.0, List.of("GRANIZO"), List.of()), "GRANIZO");
        rechaza(dto(10.0, 5.0, 1.0, List.of("RESBALADIZA"), List.of()), "Valores permitidos");   // es de calzada, no de clima
        rechaza(dto(10.0, 5.0, 1.0, List.of(), List.of("LLUVIA")), "calzadaAdversa");            // es de clima, no de calzada
        rechaza(dto(10.0, 5.0, 1.0, Arrays.asList("LLUVIA", null), List.of()), "climaAdverso");
        rechaza(dto(10.0, 5.0, 1.0, List.of("  "), List.of()), "climaAdverso");
    }

    @Test
    void sinCuerpoSeRechaza() {
        rechaza(null, "Falta la configuración");
    }
}
