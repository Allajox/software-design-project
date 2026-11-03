package model;

import enums.Gender;
import enums.VictimCondition;

public class Victim {
    private int edad;
    private Gender genero;
    private VictimCondition condicion;

    public Victim(int edad, Gender genero, VictimCondition condicion) {
        this.edad = edad;
        this.genero = genero;
        this.condicion = condicion;
    }

    public int getEdad() {
        return edad;
    }

    public Gender getGenero() {
        return genero;
    }

    public VictimCondition getCondicion() {
        return condicion;
    }
}
