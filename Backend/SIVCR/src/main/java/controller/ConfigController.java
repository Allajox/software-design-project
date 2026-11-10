package controller;

import model.dto.ConfigDto;
import model.managers.ConfigManager;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Configuración global del sistema (HU 30): pesos del ISS y condiciones adversas. Solo recibe, delega en ConfigManager
 * y responde. Ver la configuración es de ADMIN y ANALISTA (para interpretar el ISS); cambiarla es solo de ADMIN. Esa
 * regla se verifica aquí, en el servidor: ocultar el botón en la pantalla no alcanza.
 */
@RestController
@RequestMapping("/api/config")
@PreAuthorize("hasAnyRole('ADMIN', 'ANALISTA')")
public class ConfigController {

    private final ConfigManager configuracion;
    private final CurrentUser usuarios;

    public ConfigController(ConfigManager configuracion, CurrentUser usuarios) {
        this.configuracion = configuracion;
        this.usuarios = usuarios;
    }

    /** La configuración vigente. */
    @GetMapping
    public ConfigDto getConfiguracion() {
        return configuracion.obtener();
    }

    /**
     * Reemplaza toda la configuración. Los tres pesos y las dos listas son obligatorios (las listas pueden ir vacías).
     * 400 con el motivo si algún valor no es válido; en ese caso no se guarda nada. Los KPI usan el cambio desde la
     * siguiente consulta.
     */
    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ConfigDto actualizar(@RequestBody ConfigDto cuerpo) {
        return configuracion.actualizar(cuerpo, usuarios.get().id());
    }
}
