package app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Punto de arranque. Los paquetes del proyecto están en la raíz (controller, model, enums...) y no bajo
 * un paquete común, por eso se indican explícitamente. Las entidades JPA viven en app.persistence,
 * dentro del paquete de esta clase, así que Spring Boot las detecta solo.
 */
@SpringBootApplication(scanBasePackages = {"app", "controller", "model"})
public class SivcrApplication {

    public static void main(String[] args) {
        SpringApplication.run(SivcrApplication.class, args);
    }
}
