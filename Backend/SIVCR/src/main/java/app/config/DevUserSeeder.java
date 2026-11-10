package app.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * SOLO DESARROLLO (perfil "dev"): crea en app_user los tres usuarios de demostración (admin@sivcr.go.cr,
 * analista@sivcr.go.cr y consultor@sivcr.go.cr), para que una base recién creada tenga con quién iniciar sesión y
 * entrar a "Usuarios y Configuración" a crear las cuentas reales. Sus contraseñas de demostración son Admin123,
 * Analista123 y Consulta123 (guardadas como hash PBKDF2). Un servidor accesible desde fuera NO debe usar el perfil dev
 * ni estas cuentas: ahí el primer administrador se crea a mano en la base y las demás cuentas, desde la pantalla de
 * usuarios.
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
