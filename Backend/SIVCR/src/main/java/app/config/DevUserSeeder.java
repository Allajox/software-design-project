package app.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * SOLO DESARROLLO (perfil "dev"): crea en app_user los tres usuarios de demostración del frontend (los mismos de
 * core/usuarios/semilla.ts), porque ingestion_log.usuario_id referencia app_user. Los ids 1, 2 y 3 coinciden con
 * "mock-jwt-<id>" y con los de AuthService.USUARIOS_DEMO.
 *
 * Las contraseñas se guardan como hash PBKDF2 (el mismo valor que ya está en la semilla del frontend, que son las
 * contraseñas de demostración Admin123, Analista123 y Consulta123), así que con ellas se puede iniciar sesión de
 * verdad en POST /api/auth/login. Un servidor accesible desde fuera NO debe usar el perfil dev ni estas cuentas.
 * BORRAR cuando exista la gestión de usuarios.
 */
@Component
@Profile("dev")
public class DevUserSeeder implements ApplicationRunner {

    private static final String HASH_ADMIN =
            "pbkdf2-sha256$120000$MR0Q1xyzZ2kheopAjsVZRg==$URdU8CpDXp0mi5u2a483qxmQnx7W66d83bNDHOaUAxs=";
    private static final String HASH_ANALISTA =
            "pbkdf2-sha256$120000$ffyeUSn2SuZ91gC16ZHD3A==$Wogf5t1WwBLcQj7NHESPt75QhYWIEptJxMXnEP26chU=";
    private static final String HASH_CONSULTOR =
            "pbkdf2-sha256$120000$ORJsTgtuPk8YKfm8vJWJWg==$7ULhX6tRZc4dbQLfLLzZqo6kqBkAtyEGHd/LGBf6vO8=";

    private final JdbcTemplate jdbc;

    public DevUserSeeder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        String insertar = "INSERT INTO app_user (id, name, email, password_hash, rol) VALUES (?, ?, ?, ?, ?) "
                + "ON CONFLICT DO NOTHING";
        jdbc.update(insertar, 1L, "Ana Administradora", "admin@sivcr.go.cr", HASH_ADMIN, "ADMIN");
        jdbc.update(insertar, 2L, "Luis Analista", "analista@sivcr.go.cr", HASH_ANALISTA, "ANALISTA");
        jdbc.update(insertar, 3L, "Carla Consultora", "consultor@sivcr.go.cr", HASH_CONSULTOR, "CONSULTOR");
        // Bases creadas antes del login real: el seeder las dejó con el marcador '{noop}...', que no es un hash y no
        // permite entrar. Solo se reemplaza ese marcador; la contraseña que alguien haya puesto después no se toca.
        String actualizar = "UPDATE app_user SET password_hash = ? WHERE lower(email) = lower(?) "
                + "AND password_hash LIKE '{noop}%'";
        jdbc.update(actualizar, HASH_ADMIN, "admin@sivcr.go.cr");
        jdbc.update(actualizar, HASH_ANALISTA, "analista@sivcr.go.cr");
        jdbc.update(actualizar, HASH_CONSULTOR, "consultor@sivcr.go.cr");
        // los ids se insertaron a mano: se adelanta la secuencia para que los usuarios reales no choquen con ellos
        jdbc.queryForObject("SELECT setval(pg_get_serial_sequence('app_user', 'id'), (SELECT MAX(id) FROM app_user))",
                Long.class);
    }
}
