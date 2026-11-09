package model.ingestion;

import static model.ingestion.TestSupport.ENC_PERSONAS;
import static model.ingestion.TestSupport.ENC_SINIESTROS;
import static model.ingestion.TestSupport.bruta;
import static model.ingestion.TestSupport.perfil;
import static model.ingestion.TestSupport.persona;
import static model.ingestion.TestSupport.siniestro;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.QualityStatus;
import model.ingestion.profile.MappingProfile;
import org.junit.jupiter.api.Test;

/** Datos 100% sintéticos (ver TestSupport). */
class DataValidatorTest {

    private final DataValidator siniestros = new DataValidator(perfil("cosevi-siniestros"), GeoBounds.COSTA_RICA);
    private final DataValidator personas = new DataValidator(perfil("cosevi-personas"), GeoBounds.COSTA_RICA);

    private ValidationResult evaluarSiniestro(String... cambios) {
        return siniestros.evaluar(bruta(5, ENC_SINIESTROS, siniestro(cambios)));
    }

    private ValidationResult evaluarPersona(String... cambios) {
        return personas.evaluar(bruta(5, ENC_PERSONAS, persona(cambios)));
    }

    // ---- siniestros COSEVI ----

    @Test
    void filaCompletaEsValidaYSeNormaliza() {
        ValidationResult r = evaluarSiniestro();
        assertEquals(QualityStatus.VALIDO, r.estado());
        assertTrue(r.errores().isEmpty());
        assertEquals("SOLO_HERIDOS_LEVES", r.campos().get("severidad"));
        assertEquals((short) 2024, r.campos().get("anio"));
        assertEquals((short) 20, r.campos().get("hora"));
        assertEquals("NOCHE", r.campos().get("franja"));
        assertEquals("HEREDIA", r.campos().get("provincia"));
        assertEquals("MARTES", r.campos().get("dia_semana"));
        assertEquals((short) 7, r.campos().get("mes"));
        assertEquals(7.0, r.campos().get("km"));
        assertEquals("BUEN_TIEMPO", r.campos().get("clima"));
        assertEquals("Santo Domingo", r.campos().get("canton"));
    }

    @Test
    void campoObligatorioVacioDejaElRegistroIncompleto() {
        ValidationResult r = evaluarSiniestro("Provincia=");
        assertEquals(QualityStatus.INCOMPLETO, r.estado());
        assertEquals(1, r.errores().size());
        assertTrue(r.errores().get(0).startsWith("Fila 5:"));
        assertTrue(r.errores().get(0).contains("Provincia"));
    }

    @Test
    void desconocidoEnCampoObligatorioDejaElRegistroIncompleto() {
        assertEquals(QualityStatus.INCOMPLETO, evaluarSiniestro("Distrito=Desconocido").estado());
        assertEquals(QualityStatus.INCOMPLETO, evaluarSiniestro("Distrito=ignorado").estado());
    }

    @Test
    void desconocidoEnCampoOpcionalNoRestaCalidad() {
        ValidationResult r = evaluarSiniestro("Estado del tiempo=Desconocido", "Rural o urbano=Desconocida",
                "Tipo de accidente=Desconocido");
        assertEquals(QualityStatus.VALIDO, r.estado());
        assertFalse(r.campos().containsKey("clima"));
        assertFalse(r.campos().containsKey("zona"));
    }

    @Test
    void kilometroCantonalOIgnoradoQuedaVacioSinPenalizar() {
        ValidationResult cantonal = evaluarSiniestro("Ruta=Cantonal", "Kilómetro=Cantonal");
        assertEquals(QualityStatus.VALIDO, cantonal.estado());
        assertFalse(cantonal.campos().containsKey("km"));
        assertEquals("Cantonal", cantonal.campos().get("ruta"));
        assertEquals(QualityStatus.VALIDO, evaluarSiniestro("Kilómetro=Ignorado").estado());
    }

    @Test
    void anioNoNumericoOFueraDeRangoEsCorrupto() {
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Año=veinte").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Año=1850").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Año=2024.5").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Año=99999999999999999999").estado());
    }

    @Test
    void valoresFueraDeLaListaSonCorruptos() {
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Provincia=Narnia").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Clase de accidente=Otra clase").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Estado del tiempo=Nevando").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Día=9.Fakeday").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Mes=Z. Nonoviembre").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Hora=25:00-25:59", "Hora recodificada=18:00-23:59").estado());
    }

    @Test
    void kilometroNegativoONoNumericoEsCorrupto() {
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Kilómetro=-3").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Kilómetro=abc").estado());
    }

    @Test
    void horaYFranjaIncoherentesSonCorruptas() {
        ValidationResult r = evaluarSiniestro("Hora=20:00-20:59", "Hora recodificada=06:00-11:59");
        assertEquals(QualityStatus.CORRUPTO, r.estado());
        assertTrue(r.errores().get(0).contains("franja"));
    }

    @Test
    void textoMasLargoQueLaColumnaEsCorrupto() {
        assertEquals(QualityStatus.CORRUPTO, evaluarSiniestro("Cantón=" + "x".repeat(81)).estado());
    }

    @Test
    void filaConDistintaCantidadDeColumnasEsCorrupta() {
        SinisterBruteData fila = bruta(9, ENC_SINIESTROS, "Solo heridos leves;Vuelco;2024");
        assertTrue(fila.malformada());
        ValidationResult r = siniestros.evaluar(fila);
        assertEquals(QualityStatus.CORRUPTO, r.estado());
        assertTrue(r.errores().get(0).startsWith("Fila 9:"));
    }

    @Test
    void corruptoPrevaleceSobreIncompleto() {
        ValidationResult r = evaluarSiniestro("Provincia=", "Año=abc");
        assertEquals(QualityStatus.CORRUPTO, r.estado());
        assertEquals(2, r.errores().size());
    }

    @Test
    void losErroresNoExponenElContenidoDeLasCeldas() {
        String secreto = "ZZZ-contenido-privado";
        ValidationResult r = evaluarSiniestro("Año=" + secreto, "Cantón=" + secreto.repeat(10));
        assertEquals(QualityStatus.CORRUPTO, r.estado());
        r.errores().forEach(e -> assertFalse(e.contains(secreto), e));
    }

    @Test
    void validarDelDiagramaDevuelveElEstado() {
        assertEquals(QualityStatus.VALIDO, siniestros.validar(bruta(2, ENC_SINIESTROS, siniestro())));
        assertEquals(QualityStatus.CORRUPTO, siniestros.validar(bruta(2, ENC_SINIESTROS, siniestro("Año=x"))));
    }

    // ---- personas COSEVI ----

    @Test
    void personaCompletaEsValidaYSeNormaliza() {
        ValidationResult r = evaluarPersona();
        assertEquals(QualityStatus.VALIDO, r.estado());
        assertEquals("CONDUCTOR", r.campos().get("rol"));
        assertEquals("HERIDO_LEVE", r.campos().get("tipo_lesion"));
        assertEquals(28, r.campos().get("edad"));
        assertEquals("MASCULINO", r.campos().get("genero"));
        assertEquals("SAN_JOSE", r.campos().get("provincia"));
        assertEquals("VIERNES", r.campos().get("dia_semana"));
        assertEquals((short) 1, r.campos().get("mes"));
        assertEquals("Automóvil", r.campos().get("vehiculo"));
    }

    @Test
    void edadYSexoDesconocidosNoRestanCalidad() {
        ValidationResult r = evaluarPersona("Edad=Desconocida", "Sexo=Desconocido", "Edad quinquenal=Desconocida");
        assertEquals(QualityStatus.VALIDO, r.estado());
        assertNull(r.campos().get("edad"));
        assertNull(r.campos().get("genero"));
    }

    @Test
    void lesionIgnoradaORolDesconocidoDejanLaPersonaIncompleta() {
        assertEquals(QualityStatus.INCOMPLETO, evaluarPersona("Tipo de lesión=Lesión Ignorada").estado());
        assertEquals(QualityStatus.INCOMPLETO, evaluarPersona("Rol=Desconocido").estado());
    }

    @Test
    void edadImposibleEsCorrupta() {
        assertEquals(QualityStatus.CORRUPTO, evaluarPersona("Edad=250").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarPersona("Edad=-4").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarPersona("Edad=veintiocho").estado());
    }

    // ---- coordenadas (perfil sintético con latitud/longitud) ----

    private static final String YAML_CON_COORDENADAS = """
            id: prueba-coordenadas
            fuente: MOPT
            tipo: SINISTER
            verificacion: VERIFICADO
            formatos: [CSV]
            csv: { charset: AUTO, delimiter: ";" }
            encabezadosRequeridos: [anio, latitud, longitud]
            columnas:
              - { columna: anio, campo: anio, tipo: INTEGER, obligatorio: true }
              - { columna: latitud, campo: lat, tipo: LATITUDE }
              - { columna: longitud, campo: lon, tipo: LONGITUDE }
            """;

    private ValidationResult evaluarCoordenadas(String lat, String lon) {
        MappingProfile perfil = TestSupport.perfilDesdeYaml(YAML_CON_COORDENADAS);
        String encabezado = "anio;latitud;longitud";
        return new DataValidator(perfil, GeoBounds.COSTA_RICA).evaluar(bruta(2, encabezado, "2024;" + lat + ";" + lon));
    }

    @Test
    void coordenadasDentroDeCostaRicaSonValidas() {
        assertEquals(QualityStatus.VALIDO, evaluarCoordenadas("9.9281", "-84.0907").estado()); // San José
        assertEquals(QualityStatus.VALIDO, evaluarCoordenadas("10,0", "-83,5").estado());      // coma decimal
        assertEquals(QualityStatus.VALIDO, evaluarCoordenadas("5.53", "-87.06").estado());     // Isla del Coco
        assertEquals(9.9281, evaluarCoordenadas("9.9281", "-84.0907").campos().get("lat"));
    }

    @Test
    void coordenadasFueraDeCostaRicaSonCorruptas() {
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("40.4168", "-3.7038").estado()); // Madrid
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("0", "0").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("9.9281", "84.0907").estado());  // longitud sin signo
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("-84.0907", "9.9281").estado()); // invertidas
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("12.5", "-84.0").estado());      // al norte de Costa Rica
    }

    @Test
    void coordenadasInvalidasOIncompletasSonCorruptas() {
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("abc", "-84.0").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("95", "-84.0").estado());   // latitud imposible
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("9.9", "").estado());       // solo una de las dos
        assertEquals(QualityStatus.CORRUPTO, evaluarCoordenadas("", "-84.0").estado());
        ValidationResult sinCoordenadas = evaluarCoordenadas("", "");
        assertEquals(QualityStatus.VALIDO, sinCoordenadas.estado()); // ninguna de las dos: no se exige
    }

    @Test
    void validarCoordDelDiagrama() {
        assertTrue(siniestros.validarCoord(9.93, -84.08));
        assertFalse(siniestros.validarCoord(9.93, 84.08));
        assertFalse(siniestros.validarCoord(48.85, 2.35));
    }

    // ---- INEC: filtro por causa y constantes ----

    private ValidationResult evaluarInec(String causa, String provincia, String anio, String mes) {
        DataValidator inec = new DataValidator(perfil("inec-defunciones"), GeoBounds.COSTA_RICA);
        return inec.evaluar(bruta(2, "anodef;mesdef;provocu;causamuer", anio + ";" + mes + ";" + provincia + ";" + causa));
    }

    @Test
    void inecOmiteLasCausasQueNoSonAccidentesDeTransporte() {
        assertTrue(evaluarInec("J189", "1", "2023", "5").omitido());   // neumonía
        assertTrue(evaluarInec("I219", "1", "2023", "5").omitido());   // infarto
        assertTrue(evaluarInec("V90", "1", "2023", "5").omitido());    // fuera de V01-V89
        assertFalse(evaluarInec("V892", "1", "2023", "5").omitido());
        assertFalse(evaluarInec("V01", "1", "2023", "5").omitido());
        assertFalse(evaluarInec("v299", "1", "2023", "5").omitido());  // minúscula
    }

    @Test
    void inecTraduceCodigosYFijaLaSeveridad() {
        ValidationResult r = evaluarInec("V892", "7", "2023", "12");
        assertEquals(QualityStatus.VALIDO, r.estado());
        assertEquals("LIMON", r.campos().get("provincia"));
        assertEquals("FALLECIDO", r.campos().get("severidad"));
        assertEquals((short) 2023, r.campos().get("anio"));
        assertEquals((short) 12, r.campos().get("mes"));
        assertEquals("V892", r.campos().get("tipo_accidente"));
        assertEquals("ALAJUELA", evaluarInec("V892", "2.0", "2023", "5").campos().get("provincia")); // "2.0" de Excel
        assertEquals(QualityStatus.CORRUPTO, evaluarInec("V892", "9", "2023", "5").estado());
        assertEquals(QualityStatus.CORRUPTO, evaluarInec("V892", "1", "2023", "13").estado());
    }

    @Test
    void lasFilasOmitidasNoGeneranErrores() {
        ValidationResult r = evaluarInec("J189", "99", "xx", "yy");
        assertTrue(r.omitido());
        assertTrue(r.errores().isEmpty());
    }
}
