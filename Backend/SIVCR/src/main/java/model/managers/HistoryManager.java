package model.managers;

import enums.Day;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import model.FilterCriteria;
import model.FilterRepository;
import model.QueryHistory;

/** Historial de consultas de cada usuario (HU 23). */
public class HistoryManager {
    private static final int MAXIMO_HISTORIAL = 50;

    private final FilterRepository repo;

    public HistoryManager(FilterRepository repo) {
        this.repo = repo;
    }

    /**
     * Registra una consulta. No guarda consultas sin filtros ni repite la última consulta del usuario
     * (así cambiar el orden de la tabla o volver a pedir lo mismo no llena el historial).
     */
    public void registrar(long usuarioId, FilterCriteria c) {
        if (c.estaVacio()) {
            return;
        }
        List<QueryHistory> ultima = repo.recientes(usuarioId, 1);
        if (!ultima.isEmpty() && ultima.get(0).criterios().equals(c)) {
            return;
        }
        repo.registrar(usuarioId, resumen(c), c);
    }

    /** Las últimas consultas del usuario, de la más reciente a la más antigua. */
    public List<QueryHistory> getHistorial(long usuarioId) {
        return repo.recientes(usuarioId, MAXIMO_HISTORIAL);
    }

    /** Una consulta del historial del usuario, para volver a ejecutarla. */
    public Optional<QueryHistory> buscar(long usuarioId, long idConsulta) {
        return repo.buscar(usuarioId, idConsulta);
    }

    /** Texto legible para la lista del historial, por ejemplo "San jose, 2024, Lluvia". */
    static String resumen(FilterCriteria d) {
        List<String> partes = new ArrayList<>();
        agregar(partes, d.provincia());
        agregar(partes, d.canton());
        agregar(partes, d.distrito());
        if (d.ruta() != null) {
            partes.add("Ruta " + d.ruta());
        }
        if (d.anio() != null) {
            partes.add(String.valueOf(d.anio()));
        }
        if (d.mes() != null) {
            partes.add("mes " + d.mes());
        }
        agregar(partes, d.diaSemana());
        agregar(partes, d.franja());
        agregar(partes, d.tipoVehiculo());
        agregar(partes, d.severidad());
        agregar(partes, d.clima());
        agregar(partes, d.calzada());
        if (d.edadMin() != null || d.edadMax() != null) {
            partes.add("edad " + (d.edadMin() == null ? "0" : d.edadMin())
                + "-" + (d.edadMax() == null ? "+" : d.edadMax()));
        }
        agregar(partes, d.genero());
        return String.join(", ", partes);
    }

    private static void agregar(List<String> partes, Object valor) {
        if (valor == null) {
            return;
        }
        String texto = valor instanceof Enum<?> e ? e.name().replace('_', ' ').toLowerCase(Locale.ROOT) : valor.toString();
        partes.add(Character.toUpperCase(texto.charAt(0)) + texto.substring(1));
    }
}
