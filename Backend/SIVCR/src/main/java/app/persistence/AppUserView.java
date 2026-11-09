package app.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/**
 * Vista de solo lectura de app_user para identificar quién hace una carga y mostrar su nombre en el historial.
 * La gestión de usuarios (alta, contraseña, roles) es del bloque de autenticación.
 */
@Entity
@Immutable
@Table(name = "app_user")
public class AppUserView {

    @Id
    @Column(name = "id")
    public Long id;

    @Column(name = "name")
    public String name;

    @Column(name = "email")
    public String email;
}
