-- V3: ingesta de COSEVI "personas", perfil de mapeo y filas omitidas
--
-- Coordinar el siguiente número libre antes de integrar a la rama principal.
--
-- El archivo de personas de COSEVI no trae ningún identificador del siniestro,
-- así que no se puede enlazar con la tabla sinister. Las personas se guardan en victim SIN sinister_id,
-- con su propio año / provincia / cantón / distrito / día / mes, y con la carga (ingestion_log) de la que vienen.
-- Los KPI por víctima deben leer victim directamente y filtrar calidad = 'VALIDO'.
--
-- Usa los mismos placeholders de Flyway que V1 y V2 (ts_index).

-- =====================================================================
-- victim: personas sin siniestro enlazado
-- =====================================================================

ALTER TABLE victim ALTER COLUMN sinister_id DROP NOT NULL;

ALTER TABLE victim
    ADD COLUMN ingestion_log_id BIGINT,
    ADD COLUMN calidad          VARCHAR(10),
    ADD COLUMN anio             SMALLINT,
    ADD COLUMN mes              SMALLINT,
    ADD COLUMN dia_semana       VARCHAR(10),    -- LUNES ... DOMINGO
    ADD COLUMN provincia        VARCHAR(20),
    ADD COLUMN canton           VARCHAR(80),
    ADD COLUMN distrito         VARCHAR(80),
    ADD COLUMN rol              VARCHAR(40),    -- CONDUCTOR, PEATON, CICLISTA, PASAJERO_MOTO, ...
    ADD COLUMN tipo_lesion      VARCHAR(30),    -- ILESO, HERIDO_LEVE, HERIDO_GRAVE, MUERTE_EN_SITIO
    ADD COLUMN vehiculo         VARCHAR(40),    -- vehículo en el que viajaba (texto de COSEVI)
    ADD COLUMN edad_quinquenal  VARCHAR(20),
    ADD CONSTRAINT fk_victim_ingestion_log FOREIGN KEY (ingestion_log_id) REFERENCES ingestion_log (id),
    -- igual que sinister: solo se guardan VALIDO e INCOMPLETO; los CORRUPTO solo se cuentan
    ADD CONSTRAINT ck_victim_calidad CHECK (calidad IN ('VALIDO', 'INCOMPLETO')),
    ADD CONSTRAINT ck_victim_anio    CHECK (anio BETWEEN 1900 AND 2100),
    ADD CONSTRAINT ck_victim_mes     CHECK (mes BETWEEN 1 AND 12),
    -- una víctima viene de un siniestro enlazado o de una carga (o de ambos)
    ADD CONSTRAINT ck_victim_origen  CHECK (sinister_id IS NOT NULL OR ingestion_log_id IS NOT NULL);

CREATE INDEX idx_victim_ingestion_log ON victim (ingestion_log_id) TABLESPACE ${ts_index};

-- Los KPI y filtros solo leen registros VALIDO: índices parciales (más pequeños, no encarecen la carga de INCOMPLETO)
CREATE INDEX idx_victim_geo    ON victim (provincia, canton, distrito)
    TABLESPACE ${ts_index} WHERE calidad = 'VALIDO';
CREATE INDEX idx_victim_tiempo ON victim (anio, mes, dia_semana)
    TABLESPACE ${ts_index} WHERE calidad = 'VALIDO';

-- =====================================================================
-- ingestion_log / quality_report
-- =====================================================================

-- CHAR(64) no es compatible con la validación de Hibernate (String -> varchar); el SHA-256 hexadecimal mide siempre 64
ALTER TABLE ingestion_log ALTER COLUMN checksum TYPE VARCHAR(64);

-- id del perfil de mapeo usado (ej. cosevi-siniestros); NULL si la carga falló antes de elegirlo
ALTER TABLE ingestion_log ADD COLUMN perfil VARCHAR(60);

-- filas que el filtro del perfil dejó fuera (ej. INEC: causas que no son CIE-10 V01-V89); no son errores de calidad
ALTER TABLE quality_report ADD COLUMN omitidos INT NOT NULL DEFAULT 0;
