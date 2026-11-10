package app.persistence;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserViewRepository extends JpaRepository<AppUserView, Long> {

    Optional<AppUserView> findFirstByEmailIgnoreCase(String email);
}
