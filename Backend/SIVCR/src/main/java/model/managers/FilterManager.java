package model.managers;

import enums.Climate;
import enums.Day;
import enums.Gender;
import enums.Province;
import enums.RoadStatus;
import enums.Severity;
import enums.TimeSlot;
import enums.VehycleType;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import model.ConcreteFilterCriteriaBuilder;
import model.FilterCriteria;
import model.FilterRepository;
import model.FiltroInvalidoException;
import model.PerfilVictimas;
import model.SavedFilter;
import model.Sinister;
import model.SinisterRepository;
import model.SinisterRepository.Orden;
import model.VictimRepository;
import model.dto.Page;

/**
 * Filtros (HU 20 a 22): valida los criterios y los pedidos de página y orden, y delega la lectura en los repositorios.
 * No depende de Spring ni de SQL: el SQL vive en app.persistence.
 */
public class FilterManager {

    private static final int TAMANO_MAXIMO = 200;

    private final SinisterRepository siniestros;
    private final VictimRepository victimas;
    private final FilterRepository filtros;

    public FilterManager(SinisterRepository siniestros, VictimRepository victimas, FilterRepository filtros) {
        this.siniestros = siniestros;
        this.victimas = victimas;
        this.filtros = filtros;
    }

    /** Todos los siniestros que calzan con el filtro. Para tablas usar getRegistros (paginado). */
    public List<Sinister> aplicar(FilterCriteria c) {
        validarParaSiniestros(c);
        return siniestros.buscar(c);
    }

    /**
     * Una página de siniestros que calzan con el filtro (HU 20). pagina empieza en 0; tamano se limita a 200;
     * orden admite varios niveles separados por coma, cada uno "campo" o "campo:desc" (ej. "anio:desc,mes,provincia";
     * campos: ver SinisterRepository.CAMPOS_ORDENABLES; hasta MAX_NIVELES_DE_ORDEN); sin orden se usa anio, mes.
     */
    public Page<Sinister> getRegistros(FilterCriteria c, int pagina, int tamano, String orden) {
        if (pagina < 0) {
            throw new FiltroInvalidoException("La página no puede ser negativa.");
        }
        List<Orden> niveles = ordenar(orden);
        validarParaSiniestros(c);
        return siniestros.buscar(c, pagina, Math.max(1, Math.min(tamano, TAMANO_MAXIMO)), niveles);
    }

    /** Perfil de víctimas (personas VALIDO) con los filtros que existen en la tabla de personas. */
    public PerfilVictimas getPerfilVictimas(FilterCriteria c) {
        c.validar();
        return victimas.perfil(c);
    }

    /** HU 22: guarda el filtro con un nombre para el usuario indicado. */
    public SavedFilter guardarFiltro(String nombre, FilterCriteria c, long usuarioId) {
        c.validar();
        if (nombre == null || nombre.isBlank()) {
            throw new FiltroInvalidoException("El nombre del filtro no puede estar vacío.");
        }
        String limpio = nombre.trim();
        if (limpio.length() > 100) {
            throw new FiltroInvalidoException("El nombre del filtro no puede pasar de 100 caracteres.");
        }
        return filtros.guardar(usuarioId, limpio, c);
    }

    public List<SavedFilter> getFiltrosGuardados(long usuarioId) {
        return filtros.listar(usuarioId);
    }

    // Cada llamada usa su propio builder: FilterManager es único para toda la aplicación y varios usuarios
    // pueden filtrar a la vez; un builder compartido mezclaría sus criterios.
    public FilterCriteria nuevoFiltro(Province provincia, String canton, String distrito,
                                      String ruta, Integer anio, Integer mes, Day diaSemana, TimeSlot franja,
                                      VehycleType tipoVehiculo, Severity severidad, Climate clima,
                                      RoadStatus calzada, Integer edadMin, Integer edadMax, Gender genero) {
        ConcreteFilterCriteriaBuilder builder = new ConcreteFilterCriteriaBuilder();
        builder.setProvincia(provincia);
        builder.setCanton(canton);
        builder.setDistrito(distrito);
        builder.setRuta(ruta);
        builder.setAnio(anio);
        builder.setMes(mes);
        builder.setDia(diaSemana);
        builder.setFranja(franja);
        builder.setVehiculo(tipoVehiculo);
        builder.setSeveridad(severidad);
        builder.setClima(clima);
        builder.setCalzada(calzada);
        builder.setEdad(edadMin, edadMax);
        builder.setGenero(genero);
        builder.build();

        return builder.getResult();
    }

    public FilterCriteria restablecer() {
        ConcreteFilterCriteriaBuilder builder = new ConcreteFilterCriteriaBuilder();
        builder.reset();
        return builder.getResult();
    }

    private static void validarParaSiniestros(FilterCriteria c) {
        c.validar();
        // Edad y género son datos de la víctima (tabla victim). COSEVI no permite enlazar una víctima con su
        // siniestro, así que no se pueden combinar con los filtros de siniestros. Decisión pendiente (cruce con
        // víctimas): mientras tanto se rechazan de forma explícita en vez de ignorarlos en silencio.
        if (c.edadMin() != null || c.edadMax() != null || c.genero() != null) {
            throw new FiltroInvalidoException(
                    "Edad y género son datos de víctimas y todavía no se pueden combinar con los filtros de siniestros.");
        }
    }

    /** "a:desc,b" -> [Orden(a, desc), Orden(b, asc)]; sin orden, lista vacía. Rechaza campos repetidos o desconocidos. */
    static List<Orden> ordenar(String orden) {
        if (orden == null || orden.isBlank()) {
            return List.of();
        }
        List<Orden> niveles = new ArrayList<>();
        Set<String> usados = new HashSet<>();
        for (String nivel : orden.split(",", -1)) {
            String[] partes = nivel.trim().split(":", -1);
            String campo = partes[0].trim().toLowerCase(Locale.ROOT);
            String direccion = partes.length == 2 ? partes[1].trim().toLowerCase(Locale.ROOT) : "asc";
            if (partes.length > 2 || !SinisterRepository.CAMPOS_ORDENABLES.contains(campo)
                    || !(direccion.equals("asc") || direccion.equals("desc"))) {
                throw new FiltroInvalidoException("Orden no permitido. Use \"campo\" o \"campo:desc\", separados por "
                        + "coma, con campos de: " + String.join(", ", new TreeSet<>(SinisterRepository.CAMPOS_ORDENABLES))
                        + ".");
            }
            if (!usados.add(campo)) {
                throw new FiltroInvalidoException("El campo \"" + campo + "\" aparece más de una vez en el orden.");
            }
            niveles.add(new Orden(campo, direccion.equals("desc")));
        }
        if (niveles.size() > SinisterRepository.MAX_NIVELES_DE_ORDEN) {
            throw new FiltroInvalidoException("El orden admite hasta " + SinisterRepository.MAX_NIVELES_DE_ORDEN
                    + " campos.");
        }
        return niveles;
    }
}
