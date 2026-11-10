package app.persistence;

import java.util.List;
import model.Repository;
import model.SavedFilter;
import model.User;

public interface FilterRepository extends Repository<SavedFilter> {
    List<SavedFilter> findByUsuario(User usuario);
}