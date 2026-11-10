package model;

/** Puerto de lectura de víctimas. Solo cuenta personas VALIDO. La implementación vive en app.persistence. */
public interface VictimRepository {

    /** Cifras agregadas (nunca filas individuales) de las personas que calzan con los filtros de víctimas. */
    PerfilVictimas perfil(FilterCriteria criterios);
}
