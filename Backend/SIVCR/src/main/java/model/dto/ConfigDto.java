package model.dto;

import java.util.List;

/**
 * La configuración global del sistema tal como viaja por la API (GET y PUT /api/config).
 *
 * Los pesos son Double (no double) para distinguir "no vino" de 0 al validar un PUT. Las listas salen ordenadas
 * alfabéticamente para que la respuesta sea siempre igual.
 *
 * @param wFallecido     peso W1 del ISS: cuánto cuenta cada fallecido
 * @param wHeridoGrave   peso W2: cuánto cuenta cada herido grave
 * @param wHeridoLeve    peso W3: cuánto cuenta cada herido leve
 * @param climaAdverso   valores del enum Climate que cuentan como condición adversa (puede ir vacía)
 * @param calzadaAdversa valores del enum RoadStatus que cuentan como condición adversa (puede ir vacía)
 */
public record ConfigDto(Double wFallecido, Double wHeridoGrave, Double wHeridoLeve,
                        List<String> climaAdverso, List<String> calzadaAdversa) { }
