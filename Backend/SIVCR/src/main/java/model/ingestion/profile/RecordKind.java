package model.ingestion.profile;

/** A qué tabla va cada fila de un archivo: siniestro (tabla sinister) o víctima/persona (tabla victim). */
public enum RecordKind {
    SINISTER,
    VICTIM
}
