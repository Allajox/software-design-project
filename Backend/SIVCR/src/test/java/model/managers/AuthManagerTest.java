package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import enums.UserRole;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import model.PasswordHasher;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.User;
import model.UserRepository;
import model.managers.AuthManager.Sesion;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Inicio y cierre de sesión sin Spring ni base de datos (corre con "mvn test"). */
class AuthManagerTest {

    /** Reloj que la prueba adelanta a mano. */
    private static final class RelojMutable extends Clock {
        Instant ahora = Instant.parse("2026-01-01T12:00:00Z");

        @Override
        public Instant instant() {
            return ahora;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zona) {
            return this;
        }
    }

    private final PasswordHasher hasher = new PasswordHasher(1_000);
    private final RelojMutable reloj = new RelojMutable();
    private User ana;
    private User luis;
    private AuthManager auth;

    @BeforeEach
    void preparar() {
        ana = new User(7L, "Ana Admin", "ana@sivcr.test", hasher.hash("Clave-Ana-1"), UserRole.ADMIN);
        luis = new User(8L, "Luis Analista", "luis@sivcr.test", hasher.hash("Clave-Luis-1"), UserRole.ANALISTA);
        List<User> activos = List.of(ana, luis);
        UserRepository usuarios = correo -> activos.stream()
                .filter(u -> u.email().equalsIgnoreCase(correo)).findFirst();
        auth = new AuthManager(usuarios, hasher, Duration.ofMinutes(30), reloj);
    }

    private static Tipo tipoDelError(Runnable r) {
        return assertThrows(SivcrException.class, r::run).tipo();
    }

    @Test
    void loginCorrectoDevuelveElIdDelUsuarioYUnTokenQueLoIdentifica() {
        Sesion s = auth.login("ana@sivcr.test", "Clave-Ana-1");
        assertEquals(7L, s.id());
        assertEquals(Instant.parse("2026-01-01T12:30:00Z"), s.expira());
        assertEquals(7L, auth.idDe(s.token()));
        assertSame(ana, auth.usuarioDe(s.token()).orElseThrow());
    }

    @Test
    void elCorreoNoDistingueMayusculasNiEspaciosAlrededor() {
        assertEquals(8L, auth.login("  LUIS@SIVCR.TEST ", "Clave-Luis-1").id());
    }

    @Test
    void lasCredencialesMalasDanElMismoErrorSinDelatarQueFallo() {
        String[][] malas = {{"ana@sivcr.test", "otra"}, {"nadie@sivcr.test", "Clave-Ana-1"}, {"", "x"},
                {null, "x"}, {"ana@sivcr.test", ""}, {"ana@sivcr.test", null}};
        for (String[] m : malas) {
            SivcrException e = assertThrows(SivcrException.class, () -> auth.login(m[0], m[1]));
            assertEquals(Tipo.NO_AUTENTICADO, e.tipo());
            assertEquals("Correo o contraseña incorrectos.", e.getMessage());
        }
    }

    @Test
    void cadaLoginTieneSuPropioTokenYLosAnterioresSiguenVigentes() {
        Sesion uno = auth.login("ana@sivcr.test", "Clave-Ana-1");
        Sesion dos = auth.login("ana@sivcr.test", "Clave-Ana-1");
        assertNotEquals(uno.token(), dos.token());
        assertTrue(auth.usuarioDe(uno.token()).isPresent());
        assertTrue(auth.usuarioDe(dos.token()).isPresent());
    }

    @Test
    void unTokenFalsoONuloNoTieneUsuario() {
        assertFalse(auth.usuarioDe("inventado").isPresent());
        assertFalse(auth.usuarioDe(null).isPresent());
        assertEquals(Tipo.NO_AUTENTICADO, tipoDelError(() -> auth.idDe("inventado")));
    }

    @Test
    void cerrarSesionInvalidaElTokenYEsIdempotente() {
        Sesion s = auth.login("ana@sivcr.test", "Clave-Ana-1");
        auth.logout(s.token());
        assertEquals(Optional.empty(), auth.usuarioDe(s.token()));
        auth.logout(s.token());
        auth.logout("inventado");
        auth.logout(null);
    }

    @Test
    void laSesionVenceCuandoPasaSuDuracion() {
        Sesion s = auth.login("ana@sivcr.test", "Clave-Ana-1");
        reloj.ahora = s.expira(); // justo en el límite todavía vale
        assertTrue(auth.usuarioDe(s.token()).isPresent());
        reloj.ahora = s.expira().plusSeconds(1);
        assertFalse(auth.usuarioDe(s.token()).isPresent());
    }

    @Test
    void checkPermissionExigeUnoDeLosRolesIndicados() {
        String tokenAna = auth.login("ana@sivcr.test", "Clave-Ana-1").token();
        String tokenLuis = auth.login("luis@sivcr.test", "Clave-Luis-1").token();

        assertSame(ana, auth.checkPermission(tokenAna, UserRole.ADMIN));
        assertSame(luis, auth.checkPermission(tokenLuis, UserRole.ADMIN, UserRole.ANALISTA));
        assertSame(luis, auth.checkPermission(tokenLuis)); // sin roles basta con tener sesión
        assertEquals(Tipo.SIN_PERMISO, tipoDelError(() -> auth.checkPermission(tokenLuis, UserRole.ADMIN)));
        assertEquals(Tipo.NO_AUTENTICADO, tipoDelError(() -> auth.checkPermission("inventado", UserRole.ADMIN)));
    }

    @Test
    void elUsuarioNoMuestraElHashDeLaContrasenaEnSuTexto() {
        assertFalse(ana.toString().contains(ana.passwordHash()));
        assertEquals("ana@sivcr.test", ana.getName());
    }
}
