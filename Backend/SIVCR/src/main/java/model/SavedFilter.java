package model;

import java.time.LocalDateTime;

/** Filtro que un usuario guardó con un nombre (HU 22). La tabla saved_filter lo asocia a su dueño. */
public record SavedFilter(Long id, String nombre, FilterCriteria criterios, LocalDateTime creadoEn) {
}
