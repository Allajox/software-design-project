package model;

import java.util.List;

public interface Repository {
    //public void save(t info);
    
    //public void saveAll(List<> list);
    
    //public void count(List<> t);
    
    public void findByEmail(String email);
}
