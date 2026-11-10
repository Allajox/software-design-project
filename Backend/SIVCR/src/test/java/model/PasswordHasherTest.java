package model;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PasswordHasherTest {

    private final PasswordHasher hasher = new PasswordHasher(1_000); // pocas vueltas: la prueba no debe tardar

    @Test
    void laContrasenaCorrectaVerificaYLasDemasNo() {
        String hash = hasher.hash("Clave-1");
        assertTrue(hasher.verify("Clave-1", hash));
        assertFalse(hasher.verify("clave-1", hash));
        assertFalse(hasher.verify("", hash));
        assertFalse(hasher.verify(null, hash));
    }

    @Test
    void dosHashesDeLaMismaContrasenaSonDistintosPorLaSal() {
        assertNotEquals(hasher.hash("Clave-1"), hasher.hash("Clave-1"));
    }

    @Test
    void unHashMalFormadoNuncaVerificaNiLanza() {
        for (String malo : new String[] {null, "", "{noop}Clave-1", "pbkdf2-sha256$1000$abc", "md5$1$a$b",
                "pbkdf2-sha256$mil$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "pbkdf2-sha256$1000$no-es-base64$tampoco"}) {
            assertFalse(hasher.verify("Clave-1", malo), String.valueOf(malo));
        }
    }

    @Test
    void elHashFalsoSirveParaGastarTiempoPeroNoVerificaNada() {
        assertFalse(hasher.verify("Clave-1", hasher.hashFalso()));
        assertFalse(hasher.verify("", hasher.hashFalso()));
    }

    @Test
    void verificaLosHashesDeDemostracionDelFrontend() {
        // los mismos que están en DevUserSeeder y en core/usuarios/semilla.ts
        assertTrue(hasher.verify("Admin123",
                "pbkdf2-sha256$120000$MR0Q1xyzZ2kheopAjsVZRg==$URdU8CpDXp0mi5u2a483qxmQnx7W66d83bNDHOaUAxs="));
        assertTrue(hasher.verify("Analista123",
                "pbkdf2-sha256$120000$ffyeUSn2SuZ91gC16ZHD3A==$Wogf5t1WwBLcQj7NHESPt75QhYWIEptJxMXnEP26chU="));
        assertTrue(hasher.verify("Consulta123",
                "pbkdf2-sha256$120000$ORJsTgtuPk8YKfm8vJWJWg==$7ULhX6tRZc4dbQLfLLzZqo6kqBkAtyEGHd/LGBf6vO8="));
    }

    @Test
    void noAceptaMenosVueltasDeLasMinimas() {
        assertThrows(IllegalArgumentException.class, () -> new PasswordHasher(999));
    }
}
