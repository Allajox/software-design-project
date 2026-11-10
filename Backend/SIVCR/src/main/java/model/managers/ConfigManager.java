package model.managers;

import enums.Climate;
import enums.RoadStatus;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import model.ConfigStore;
import model.FiltroInvalidoException;
import model.SystemConfig;
import model.dto.ConfigDto;

/**
 * Configuración global del sistema (HU 30): pesos del ISS y qué clima y calzada cuentan como condición adversa.
 * Valida lo que manda el administrador y deja que el almacén lo guarde; los KPI la leen en cada consulta, así que un
 * cambio se ve de inmediato. Sin dependencias del framework.
 *
 * El PUT reemplaza TODA la configuración (no es parcial): así un campo olvidado no borra en silencio los valores
 * adversos. Para dejar una lista vacía hay que mandarla vacía.
 */
public class ConfigManager {

    /** El máximo de la columna NUMERIC(8,2) de system_config: pasarse daría un error de base de datos. */
    static final double PESO_MAXIMO = 999_999.99;

    private final ConfigStore almacen;

    public ConfigManager(ConfigStore almacen) {
        this.almacen = almacen;
    }

    public ConfigDto obtener() {
        SystemConfig c = almacen.leer();
        return new ConfigDto(c.wFallecido(), c.wHeridoGrave(), c.wHeridoLeve(),
            c.climaAdverso().stream().sorted().toList(), c.calzadaAdversa().stream().sorted().toList());
    }

    /** Valida, guarda a nombre de usuarioId y devuelve lo que quedó guardado. */
    public ConfigDto actualizar(ConfigDto pedido, long usuarioId) {
        if (pedido == null) {
            throw new FiltroInvalidoException("Falta la configuración a guardar.");
        }
        double w1 = peso(pedido.wFallecido(), "wFallecido");
        double w2 = peso(pedido.wHeridoGrave(), "wHeridoGrave");
        double w3 = peso(pedido.wHeridoLeve(), "wHeridoLeve");
        if (w1 == 0 && w2 == 0 && w3 == 0) {
            throw new FiltroInvalidoException("Al menos un peso debe ser mayor que cero: con los tres en cero el ISS "
                + "siempre valdría 0.");
        }
        Set<String> clima = valores(pedido.climaAdverso(), "climaAdverso", nombres(Climate.values()));
        Set<String> calzada = valores(pedido.calzadaAdversa(), "calzadaAdversa", nombres(RoadStatus.values()));
        almacen.guardar(new SystemConfig(w1, w2, w3, clima, calzada), usuarioId);
        return obtener();
    }

    private static List<String> nombres(Enum<?>[] constantes) {
        return Arrays.stream(constantes).map(Enum::name).toList();
    }

    private static double peso(Double valor, String campo) {
        if (valor == null) {
            throw new FiltroInvalidoException("Falta el peso " + campo + ".");
        }
        if (valor.isNaN() || valor.isInfinite()) {
            throw new FiltroInvalidoException("El peso " + campo + " no es un número válido.");
        }
        if (valor < 0) {
            throw new FiltroInvalidoException("El peso " + campo + " no puede ser negativo.");
        }
        if (valor > PESO_MAXIMO) {
            throw new FiltroInvalidoException("El peso " + campo + " no puede pasar de 999999.99.");
        }
        // la base guarda 2 decimales: con más se redondearía en silencio y lo guardado no sería lo que el admin escribió
        if (BigDecimal.valueOf(valor).stripTrailingZeros().scale() > 2) {
            throw new FiltroInvalidoException("El peso " + campo + " admite como máximo 2 decimales.");
        }
        return valor;
    }

    private static Set<String> valores(List<String> pedidos, String campo, List<String> permitidos) {
        if (pedidos == null) {
            throw new FiltroInvalidoException("Falta " + campo + " (si ningún valor cuenta como adverso, mande una "
                + "lista vacía).");
        }
        Set<String> limpios = new LinkedHashSet<>();
        for (String texto : pedidos) {
            String valor = texto == null ? "" : texto.trim().toUpperCase(Locale.ROOT);
            if (!permitidos.contains(valor)) {
                throw new FiltroInvalidoException("Valor no válido en " + campo + ": \""
                    + (texto == null ? "" : texto.trim()) + "\". Valores permitidos: " + String.join(", ", permitidos) + ".");
            }
            limpios.add(valor);
        }
        return limpios;
    }
}
