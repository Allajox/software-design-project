package model;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = {"model", "controller", "enums"})
public class SIVCR {

    public static void main(String[] args) {
        SpringApplication.run(SIVCR.class, args);
    }
}
