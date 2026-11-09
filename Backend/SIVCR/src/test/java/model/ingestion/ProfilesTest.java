package model.ingestion;

import static model.ingestion.TestSupport.ENC_PERSONAS;
import static model.ingestion.TestSupport.ENC_SINIESTROS;
import static model.ingestion.TestSupport.perfil;
import static model.ingestion.TestSupport.perfilDesdeYaml;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.DataSource;
import enums.FileFormat;
import java.util.Arrays;
import java.util.List;
import model.ingestion.profile.MappingProfile;
import model.ingestion.profile.MappingProfile.Verificacion;
import model.ingestion.profile.RecordKind;
import org.junit.jupiter.api.Test;

/** Los perfiles YAML reales deben cargar, y los YAML mal escritos deben fallar al arrancar con un mensaje útil. */
class ProfilesTest {

    @Test
    void losCincoPerfilesDelProyectoCargan() {
        for (String id : List.of("cosevi-siniestros", "cosevi-personas", "inec-defunciones", "mopt-red-vial",
                "imn-clima-open-meteo")) {
            assertEquals(id, perfil(id).id());
        }
    }

    @Test
    void coseviSiniestrosCoincideConElEncabezadoRealYNoConElDePersonas() {
        MappingProfile siniestros = perfil("cosevi-siniestros");
        assertEquals(DataSource.COSEVI, siniestros.fuente());
        assertEquals(RecordKind.SINISTER, siniestros.tipo());
        assertEquals(Verificacion.VERIFICADO, siniestros.verificacion());
        assertTrue(siniestros.habilitado());
        assertEquals(';', siniestros.delimitador());
        assertEquals(16, siniestros.columnas().size());
        assertTrue(siniestros.coincideCon(Arrays.asList(ENC_SINIESTROS.split(";"))));
        assertFalse(siniestros.coincideCon(Arrays.asList(ENC_PERSONAS.split(";"))));
    }

    @Test
    void coseviPersonasCoincideConElEncabezadoRealYNoConElDeSiniestros() {
        MappingProfile personas = perfil("cosevi-personas");
        assertEquals(RecordKind.VICTIM, personas.tipo());
        assertTrue(personas.coincideCon(Arrays.asList(ENC_PERSONAS.split(";"))));
        assertFalse(personas.coincideCon(Arrays.asList(ENC_SINIESTROS.split(";"))));
    }

    @Test
    void elPerfilDiceQueColumnasFaltan() {
        MappingProfile siniestros = perfil("cosevi-siniestros");
        List<String> sinHora = Arrays.stream(ENC_SINIESTROS.split(";")).filter(c -> !c.equals("Hora")).toList();
        assertEquals(List.of("Hora"), siniestros.encabezadosFaltantes(sinHora));
    }

    @Test
    void inecEstaMarcadoPorVerificar_yMoptEImnEstanDeshabilitados() {
        assertEquals(Verificacion.POR_VERIFICAR, perfil("inec-defunciones").verificacion());
        assertTrue(perfil("inec-defunciones").habilitado());

        MappingProfile mopt = perfil("mopt-red-vial");
        assertFalse(mopt.habilitado());
        assertTrue(mopt.motivoDeshabilitado().contains("red vial"));
        assertEquals(java.util.Set.of(FileFormat.JSON), mopt.formatos());
        assertEquals("features", mopt.rutaRegistrosJson());

        MappingProfile imn = perfil("imn-clima-open-meteo");
        assertFalse(imn.habilitado());
        assertEquals(DataSource.IMN, imn.fuente());
    }

    // ---- validación de YAML mal escritos ----

    private static final String ENCABEZADO_YAML = """
            id: prueba
            fuente: COSEVI
            tipo: SINISTER
            encabezadosRequeridos: [a]
            """;

    private static String mensajeDeError(String yaml) {
        return assertThrows(IllegalArgumentException.class, () -> perfilDesdeYaml(yaml)).getMessage();
    }

    @Test
    void rechazaUnCampoDestinoQueNoExiste() {
        String m = mensajeDeError(ENCABEZADO_YAML + "columnas:\n  - { columna: a, campo: inventado, tipo: STRING }\n");
        assertTrue(m.contains("inventado") && m.contains("prueba"), m);
    }

    @Test
    void rechazaUnTipoIncompatibleConElCampo() {
        String m = mensajeDeError(ENCABEZADO_YAML + "columnas:\n  - { columna: a, campo: anio, tipo: STRING }\n");
        assertTrue(m.contains("no es compatible"), m);
    }

    @Test
    void rechazaChoiceSinValores() {
        String m = mensajeDeError(ENCABEZADO_YAML + "columnas:\n  - { columna: a, campo: provincia, tipo: CHOICE }\n");
        assertTrue(m.contains("valores"), m);
    }

    @Test
    void rechazaUnValorCanonicoMasLargoQueLaColumna() {
        String m = mensajeDeError(ENCABEZADO_YAML + """
                columnas:
                  - columna: a
                    campo: provincia
                    tipo: CHOICE
                    valores: { x: ESTE_VALOR_ES_DEMASIADO_LARGO_PARA_LA_COLUMNA }
                """);
        assertTrue(m.contains("excede"), m);
    }

    @Test
    void rechazaDosColumnasParaElMismoCampo() {
        String m = mensajeDeError(ENCABEZADO_YAML + """
                columnas:
                  - { columna: a, campo: canton, tipo: STRING }
                  - { columna: b, campo: canton, tipo: STRING }
                """);
        assertTrue(m.contains("más de una columna"), m);
    }

    @Test
    void rechazaConstantesNoTextoOInexistentes() {
        String base = ENCABEZADO_YAML + "columnas:\n  - { columna: a, campo: canton, tipo: STRING }\n";
        assertTrue(mensajeDeError(base + "constantes: { anio: 2024 }\n").contains("texto"));
        assertTrue(mensajeDeError(base + "constantes: { nada: x }\n").contains("nada"));
    }

    @Test
    void rechazaUnPerfilHabilitadoSinColumnasOSinEncabezados() {
        assertTrue(mensajeDeError(ENCABEZADO_YAML).contains("al menos una columna"));
        String sinEncabezados = "id: p\nfuente: COSEVI\ntipo: SINISTER\ncolumnas:\n  - { columna: a, campo: canton, tipo: STRING }\n";
        assertTrue(mensajeDeError(sinEncabezados).contains("encabezadosRequeridos"));
    }

    @Test
    void rechazaUnPerfilDeshabilitadoSinMotivo() {
        assertTrue(mensajeDeError("id: p\nfuente: MOPT\ntipo: SINISTER\nhabilitado: false\n").contains("motivoDeshabilitado"));
    }

    @Test
    void rechazaValoresDeEnumeracionInvalidosYFaltantes() {
        assertTrue(mensajeDeError("id: p\nfuente: NASA\ntipo: SINISTER\n").contains("NASA"));
        assertTrue(mensajeDeError("fuente: COSEVI\ntipo: SINISTER\n").contains("id"));
        assertTrue(mensajeDeError("- esto\n- es una lista\n").contains("mapa"));
    }

    @Test
    void lasColumnasObligatoriasYLosFiltrosSumanEncabezadosRequeridos() {
        MappingProfile p = perfilDesdeYaml("""
                id: p
                fuente: INEC
                tipo: SINISTER
                encabezadosRequeridos: [a]
                filtros:
                  - { columna: causa, patron: "^V" }
                columnas:
                  - { columna: b, campo: anio, tipo: INTEGER, obligatorio: true }
                  - { columna: c, campo: canton, tipo: STRING }
                """);
        assertEquals(List.of("a", "b", "causa"), p.encabezadosRequeridos());
    }
}
