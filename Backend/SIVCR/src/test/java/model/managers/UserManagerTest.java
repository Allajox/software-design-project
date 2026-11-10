package model.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

import enums.UserRole;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import model.PasswordHasher;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.User;
import model.UserAccount;
import model.UserAdminRepository;
import org.junit.jupiter.api.Test;

/** Reglas de la gestión de usuarios (HU 29) sin base de datos ni Spring (corre con "mvn test"). */
class UserManagerTest {

    /** app_user en memoria. Guarda el hash y el estado como la tabla real. */
    private static class Usuarios implements UserAdminRepository {
        record Fila(long id, String nombre, String correo, String hash, UserRole rol, boolean activo) { }

        final Map<Long, Fila> filas = new LinkedHashMap<>();
        long siguiente = 1;

        long agregar(String nombre, String correo, String hash, UserRole rol) {
            long id = siguiente++;
            filas.put(id, new Fila(id, nombre, correo, hash, rol, true));
            return id;
        }

        @Override public Optional<User> findByEmail(String email) {
            return filas.values().stream().filter(f -> f.activo() && f.correo().equalsIgnoreCase(email))
                .map(f -> new User(f.id(), f.nombre(), f.correo(), f.hash(), f.rol())).findFirst();
        }
        @Override public List<UserAccount> listar() {
            return new ArrayList<>(filas.values().stream().map(Usuarios::cuenta).toList());
        }
        @Override public Optional<UserAccount> buscar(long id) {
            return Optional.ofNullable(filas.get(id)).map(Usuarios::cuenta);
        }
        @Override public boolean existeCorreo(String correo, long excluirId) {
            return filas.values().stream().anyMatch(f -> f.id() != excluirId && f.correo().equalsIgnoreCase(correo));
        }
        @Override public long crear(String nombre, String correo, String hash, UserRole rol) {
            return agregar(nombre, correo, hash, rol);
        }
        @Override public void actualizar(long id, String nombre, String correo, UserRole rol) {
            Fila f = filas.get(id);
            filas.put(id, new Fila(id, nombre, correo, f.hash(), rol, f.activo()));
        }
        @Override public void cambiarClave(long id, String hash) {
            Fila f = filas.get(id);
            filas.put(id, new Fila(id, f.nombre(), f.correo(), hash, f.rol(), f.activo()));
        }
        @Override public void cambiarEstado(long id, boolean activo) {
            Fila f = filas.get(id);
            filas.put(id, new Fila(id, f.nombre(), f.correo(), f.hash(), f.rol(), activo));
        }
        @Override public long contarAdministradoresActivos() {
            return filas.values().stream().filter(f -> f.rol() == UserRole.ADMIN && f.activo()).count();
        }

        static UserAccount cuenta(Fila f) {
            return new UserAccount(f.id(), f.nombre(), f.correo(), f.rol(), f.activo(), LocalDateTime.of(2026, 11, 9, 12, 0));
        }
    }

    private static final String CLAVE = "Clave-Segura-1";

    private final PasswordHasher hasher = new PasswordHasher(1_000);
    private final Usuarios usuarios = new Usuarios();
    private final AuthManager auth = new AuthManager(usuarios, hasher, Duration.ofHours(1), Clock.systemUTC());
    private final UserManager manager = new UserManager(usuarios, hasher, auth);
    private final long ana = usuarios.agregar("Ana Administradora", "ana@sivcr.test", hasher.hash(CLAVE), UserRole.ADMIN);
    private final long luis = usuarios.agregar("Luis Analista", "luis@sivcr.test", hasher.hash(CLAVE), UserRole.ANALISTA);

    private SivcrException rechazo(Runnable accion, Tipo tipo, String fragmento) {
        SivcrException e = assertThrows(SivcrException.class, accion::run);
        assertEquals(tipo, e.tipo(), e.getMessage());
        assertTrue(e.getMessage().contains(fragmento), e.getMessage());
        return e;
    }

    private long cuantos() {
        return usuarios.filas.size();
    }

    // ---- crear ----

    @Test
    void creaUnaCuentaActivaConHashYNormalizaNombreYCorreo() {
        UserAccount nueva = manager.crear("  Carla   de  la  Consulta ", "  Carla@SIVCR.Test ", UserRole.CONSULTOR, CLAVE);
        assertEquals("Carla de la Consulta", nueva.nombre());
        assertEquals("carla@sivcr.test", nueva.correo());
        assertEquals(UserRole.CONSULTOR, nueva.rol());
        assertTrue(nueva.activo());
        String guardado = usuarios.filas.get(nueva.id()).hash();
        assertNotEquals(CLAVE, guardado, "la contraseña nunca se guarda tal cual");
        assertTrue(hasher.verify(CLAVE, guardado));
        // y con esa contraseña se puede iniciar sesión de verdad
        assertEquals(nueva.id(), auth.login("carla@sivcr.test", CLAVE).usuario().id());
    }

    @Test
    void rechazaNombresInvalidos() {
        rechazo(() -> manager.crear(null, "a@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "obligatorio");
        rechazo(() -> manager.crear("   ", "a@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "obligatorio");
        rechazo(() -> manager.crear("Al", "a@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "al menos 3");
        rechazo(() -> manager.crear("x".repeat(61), "a@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "60");
        rechazo(() -> manager.crear("12345", "a@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "letras");
        assertEquals(2, cuantos());
    }

    @Test
    void rechazaCorreosInvalidos() {
        rechazo(() -> manager.crear("Carla", null, UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "obligatorio");
        rechazo(() -> manager.crear("Carla", "sin-arroba", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "válido");
        rechazo(() -> manager.crear("Carla", "a@b", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "válido");
        rechazo(() -> manager.crear("Carla", "con espacio@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "válido");
        rechazo(() -> manager.crear("Carla", "a".repeat(100) + "@b.cr", UserRole.ANALISTA, CLAVE), Tipo.SOLICITUD_INVALIDA, "100");
        assertEquals(2, cuantos());
    }

    @Test
    void rechazaContrasenasQueNoCumplenLaPolitica() {
        for (String floja : new String[] {"Ab1", "sinmayuscula1", "SINMINUSCULA1", "SinNumeroAqui"}) {
            rechazo(() -> manager.crear("Carla", "carla@b.cr", UserRole.ANALISTA, floja), Tipo.SOLICITUD_INVALIDA, "al menos 8");
        }
        rechazo(() -> manager.crear("Carla", "carla@b.cr", UserRole.ANALISTA, null), Tipo.SOLICITUD_INVALIDA, "obligatoria");
        rechazo(() -> manager.crear("Carla", "carla@b.cr", UserRole.ANALISTA, ""), Tipo.SOLICITUD_INVALIDA, "obligatoria");
        rechazo(() -> manager.crear("Carla", "carla@b.cr", UserRole.ANALISTA, "Aa1" + "x".repeat(62)), Tipo.SOLICITUD_INVALIDA, "64");
        assertEquals(2, cuantos());
    }

    @Test
    void rechazaCrearSinRol() {
        rechazo(() -> manager.crear("Carla", "carla@b.cr", null, CLAVE), Tipo.SOLICITUD_INVALIDA, "rol");
    }

    @Test
    void rechazaUnCorreoYaUsadoSinDistinguirMayusculas() {
        rechazo(() -> manager.crear("Otra Ana", "ANA@sivcr.test", UserRole.ANALISTA, CLAVE), Tipo.CONFLICTO, "Ya existe");
        assertEquals(2, cuantos());
    }

    // ---- actualizar ----

    @Test
    void actualizaNombreCorreoYRolDejandoLaContrasenaSiVieneVacia() {
        UserAccount cambiada = manager.actualizar(luis, "Luis Pérez", "luis.perez@sivcr.test", UserRole.CONSULTOR, "", ana);
        assertEquals("Luis Pérez", cambiada.nombre());
        assertEquals("luis.perez@sivcr.test", cambiada.correo());
        assertEquals(UserRole.CONSULTOR, cambiada.rol());
        assertTrue(hasher.verify(CLAVE, usuarios.filas.get(luis).hash()), "la contraseña actual no cambió");
        manager.actualizar(luis, "Luis Pérez", "luis.perez@sivcr.test", UserRole.CONSULTOR, null, ana); // null igual
        assertTrue(hasher.verify(CLAVE, usuarios.filas.get(luis).hash()));
    }

    @Test
    void cambiaLaContrasenaCuandoVieneYValidaLaPolitica() {
        manager.actualizar(luis, "Luis Analista", "luis@sivcr.test", UserRole.ANALISTA, "Nueva-Clave-9", ana);
        assertTrue(hasher.verify("Nueva-Clave-9", usuarios.filas.get(luis).hash()));
        assertFalse(hasher.verify(CLAVE, usuarios.filas.get(luis).hash()));
        rechazo(() -> manager.actualizar(luis, "Luis Analista", "luis@sivcr.test", UserRole.ANALISTA, "floja", ana),
            Tipo.SOLICITUD_INVALIDA, "al menos 8");
        assertTrue(hasher.verify("Nueva-Clave-9", usuarios.filas.get(luis).hash()), "una clave rechazada no cambia nada");
    }

    @Test
    void actualizarUnUsuarioInexistenteEsNoEncontrado() {
        rechazo(() -> manager.actualizar(999, "Alguien", "a@b.cr", UserRole.ANALISTA, null, ana), Tipo.NO_ENCONTRADO, "999");
    }

    @Test
    void elCorreoDeOtraCuentaChocaPeroElPropioNo() {
        rechazo(() -> manager.actualizar(luis, "Luis Analista", "ana@sivcr.test", UserRole.ANALISTA, null, ana),
            Tipo.CONFLICTO, "Ya existe");
        manager.actualizar(luis, "Luis Analista", "LUIS@sivcr.test", UserRole.ANALISTA, null, ana); // su propio correo
        assertEquals("luis@sivcr.test", usuarios.filas.get(luis).correo());
    }

    @Test
    void nadieCambiaSuPropioRol() {
        rechazo(() -> manager.actualizar(ana, "Ana Administradora", "ana@sivcr.test", UserRole.ANALISTA, null, ana),
            Tipo.SOLICITUD_INVALIDA, "propio rol");
        assertEquals(UserRole.ADMIN, usuarios.filas.get(ana).rol());
    }

    @Test
    void siempreQuedaUnAdministradorActivo() {
        // Ana es la única administradora: otra persona (Luis, sin permiso real aquí) no puede quitarle el rol
        rechazo(() -> manager.actualizar(ana, "Ana Administradora", "ana@sivcr.test", UserRole.CONSULTOR, null, luis),
            Tipo.SOLICITUD_INVALIDA, "única persona administradora");
        // con una segunda administradora sí se puede
        long bea = usuarios.agregar("Bea Admin", "bea@sivcr.test", hasher.hash(CLAVE), UserRole.ADMIN);
        manager.actualizar(ana, "Ana Administradora", "ana@sivcr.test", UserRole.CONSULTOR, null, bea);
        assertEquals(UserRole.CONSULTOR, usuarios.filas.get(ana).rol());
        // y ahora Bea queda como única
        rechazo(() -> manager.actualizar(bea, "Bea Admin", "bea@sivcr.test", UserRole.CONSULTOR, null, luis),
            Tipo.SOLICITUD_INVALIDA, "única persona administradora");
    }

    // ---- estado ----

    @Test
    void desactivarCierraLasSesionesYImpideElLogin() {
        String token = auth.login("luis@sivcr.test", CLAVE).token();
        assertTrue(auth.usuarioDe(token).isPresent());

        UserAccount desactivada = manager.cambiarEstado(luis, false, ana);
        assertFalse(desactivada.activo());
        assertTrue(auth.usuarioDe(token).isEmpty(), "la sesión abierta se cerró");
        SivcrException e = assertThrows(SivcrException.class, () -> auth.login("luis@sivcr.test", CLAVE));
        assertEquals(Tipo.NO_AUTENTICADO, e.tipo());
        assertEquals(2, manager.listar().size(), "la cuenta desactivada sigue en la lista");

        assertTrue(manager.cambiarEstado(luis, true, ana).activo());
        assertEquals(luis, auth.login("luis@sivcr.test", CLAVE).usuario().id());
    }

    @Test
    void cambiarAlgoQueYaEstaAsiNoHaceNada() {
        UserAccount igual = manager.cambiarEstado(luis, true, ana);
        assertTrue(igual.activo());
    }

    @Test
    void nadieDesactivaSuPropiaCuentaNiDejaAlSistemaSinAdministrador() {
        rechazo(() -> manager.cambiarEstado(ana, false, ana), Tipo.SOLICITUD_INVALIDA, "propia cuenta");
        rechazo(() -> manager.cambiarEstado(ana, false, luis), Tipo.SOLICITUD_INVALIDA, "única persona administradora");
        assertTrue(usuarios.filas.get(ana).activo());
        long bea = usuarios.agregar("Bea Admin", "bea@sivcr.test", hasher.hash(CLAVE), UserRole.ADMIN);
        manager.cambiarEstado(ana, false, bea); // con otra administradora activa, sí
        assertFalse(usuarios.filas.get(ana).activo());
    }

    @Test
    void estadoDeUnUsuarioInexistenteEsNoEncontrado() {
        rechazo(() -> manager.cambiarEstado(999, false, ana), Tipo.NO_ENCONTRADO, "999");
    }

    // ---- sesiones ----

    @Test
    void cambiarElRolOLaContrasenaDeOtraPersonaCierraSusSesiones() {
        String token = auth.login("luis@sivcr.test", CLAVE).token();
        manager.actualizar(luis, "Luis Analista", "luis@sivcr.test", UserRole.CONSULTOR, null, ana);
        assertTrue(auth.usuarioDe(token).isEmpty(), "con el rol nuevo debe volver a iniciar sesión");

        String otro = auth.login("luis@sivcr.test", CLAVE).token();
        manager.actualizar(luis, "Luis Analista", "luis@sivcr.test", UserRole.CONSULTOR, "Otra-Clave-7", ana);
        assertTrue(auth.usuarioDe(otro).isEmpty());
    }

    @Test
    void cambiarSoloElNombreNoCierraSesiones() {
        String token = auth.login("luis@sivcr.test", CLAVE).token();
        manager.actualizar(luis, "Luis A. Pérez", "luis@sivcr.test", UserRole.ANALISTA, null, ana);
        assertTrue(auth.usuarioDe(token).isPresent());
    }

    @Test
    void quienSeEditaASiMismoConservaSuSesion() {
        String token = auth.login("ana@sivcr.test", CLAVE).token();
        manager.actualizar(ana, "Ana Administradora", "ana@sivcr.test", UserRole.ADMIN, "Clave-Nueva-5", ana);
        assertTrue(auth.usuarioDe(token).isPresent());
        assertTrue(hasher.verify("Clave-Nueva-5", usuarios.filas.get(ana).hash()));
    }
}
