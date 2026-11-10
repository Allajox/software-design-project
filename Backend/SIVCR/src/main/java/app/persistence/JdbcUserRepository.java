package app.persistence;

import enums.UserRole;
import java.util.Optional;
import model.User;
import model.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Usuarios de la tabla app_user. Solo devuelve cuentas activas. */
@Repository
public class JdbcUserRepository implements UserRepository {

    private final JdbcTemplate jdbc;

    public JdbcUserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<User> findByEmail(String email) {
        // el índice único sobre lower(email) garantiza a lo sumo una fila
        return jdbc.query("SELECT id, name, email, password_hash, rol FROM app_user "
                + "WHERE lower(email) = lower(?) AND activo",
                (rs, n) -> new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"),
                        rs.getString("password_hash"), UserRole.valueOf(rs.getString("rol"))),
                email).stream().findFirst();
    }
}
