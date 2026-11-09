package app.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * SOLO DESARROLLO (perfil "dev"): crea en app_user los tres usuarios del login simulado de Angular, porque
 * ingestion_log.usuario_id referencia app_user. Los ids 1, 2 y 3 coinciden con "mock-jwt-<id>".
 * No guarda contraseñas reales. BORRAR junto con DevSecurityConfig cuando exista la autenticación real.
 */
@Component
@Profile("dev")
public class DevUserSeeder implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public DevUserSeeder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        String sql = "INSERT INTO app_user (id, name, email, password_hash, rol) VALUES (?, ?, ?, '{noop}solo-desarrollo', ?) "
                + "ON CONFLICT DO NOTHING";
        jdbc.update(sql, 1L, "Ana Administradora", "admin@sivcr.go.cr", "ADMIN");
        jdbc.update(sql, 2L, "Luis Analista", "analista@sivcr.go.cr", "ANALISTA");
        jdbc.update(sql, 3L, "Carla Consultora", "consultor@sivcr.go.cr", "CONSULTOR");
        // los ids se insertaron a mano: se adelanta la secuencia para que los usuarios reales no choquen con ellos
        jdbc.queryForObject("SELECT setval(pg_get_serial_sequence('app_user', 'id'), (SELECT MAX(id) FROM app_user))",
                Long.class);
    }
}
