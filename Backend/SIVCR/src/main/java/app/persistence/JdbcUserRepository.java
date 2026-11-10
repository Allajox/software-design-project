package app.persistence;

import enums.UserRole;
import java.util.List;
import java.util.Optional;
import model.SivcrException;
import model.SivcrException.Tipo;
import model.User;
import model.UserAccount;
import model.UserAdminRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * Usuarios de la tabla app_user. findByEmail (para el login) solo devuelve cuentas activas; el resto de métodos son
 * de la gestión de usuarios (HU 29) y ven todas. Nada de esto devuelve el hash de la contraseña salvo findByEmail, que
 * lo necesita para verificar el login.
 */
@Repository
public class JdbcUserRepository implements UserAdminRepository {

    private static final RowMapper<UserAccount> CUENTA = (rs, n) -> new UserAccount(rs.getLong("id"),
            rs.getString("name"), rs.getString("email"), UserRole.valueOf(rs.getString("rol")),
            rs.getBoolean("activo"), rs.getTimestamp("creado_en").toLocalDateTime());

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

    @Override
    public List<UserAccount> listar() {
        return jdbc.query("SELECT id, name, email, rol, activo, creado_en FROM app_user ORDER BY lower(name), id",
                CUENTA);
    }

    @Override
    public Optional<UserAccount> buscar(long id) {
        return jdbc.query("SELECT id, name, email, rol, activo, creado_en FROM app_user WHERE id = ?", CUENTA, id)
                .stream().findFirst();
    }

    @Override
    public boolean existeCorreo(String correo, long excluirId) {
        Integer cuantas = jdbc.queryForObject(
                "SELECT count(*) FROM app_user WHERE lower(email) = lower(?) AND id <> ?", Integer.class,
                correo, excluirId);
        return cuantas != null && cuantas > 0;
    }

    @Override
    public long crear(String nombre, String correo, String passwordHash, UserRole rol) {
        try {
            Long id = jdbc.queryForObject("INSERT INTO app_user (name, email, password_hash, rol) "
                    + "VALUES (?, ?, ?, ?) RETURNING id", Long.class, nombre, correo, passwordHash, rol.name());
            return id == null ? 0 : id;
        } catch (DuplicateKeyException e) {
            throw correoRepetido(e);
        }
    }

    @Override
    public void actualizar(long id, String nombre, String correo, UserRole rol) {
        try {
            jdbc.update("UPDATE app_user SET name = ?, email = ?, rol = ? WHERE id = ?", nombre, correo, rol.name(), id);
        } catch (DuplicateKeyException e) {
            throw correoRepetido(e);
        }
    }

    @Override
    public void cambiarClave(long id, String passwordHash) {
        jdbc.update("UPDATE app_user SET password_hash = ? WHERE id = ?", passwordHash, id);
    }

    @Override
    public void cambiarEstado(long id, boolean activo) {
        jdbc.update("UPDATE app_user SET activo = ? WHERE id = ?", activo, id);
    }

    @Override
    public long contarAdministradoresActivos() {
        Long cuantos = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE rol = 'ADMIN' AND activo", Long.class);
        return cuantos == null ? 0 : cuantos;
    }

    /** Dos altas a la vez con el mismo correo: la que llega segunda choca con el índice único. */
    private static RuntimeException correoRepetido(DuplicateKeyException e) {
        String detalle = String.valueOf(e.getMessage());
        if (detalle.contains("uq_app_user_email")) {
            return new SivcrException(Tipo.CONFLICTO, "Ya existe una cuenta con ese correo.", e);
        }
        return e; // otra clave repetida (por ejemplo el id): es un error del servidor, no del usuario
    }
}
