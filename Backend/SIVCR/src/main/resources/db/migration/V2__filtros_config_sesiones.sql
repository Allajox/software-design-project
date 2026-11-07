-- V2: filtros guardados, historial de consultas, configuración del sistema, sesiones
--     y ajustes de sinister según la estructura real de COSEVI.csv
--
-- Usa los mismos placeholders de Flyway que V1 (ts_data, ts_index, ts_admin).
--
-- Decisiones de diseño:
--  * COSEVI no trae fecha exacta ni coordenadas: trae año, mes, día de la semana y hora.
--    Esas columnas se guardan por separado porque son justo las que usan los filtros (HU 7).
--    `fecha`, `lat`, `lon`, `tipo_vehiculo` y `tiempo_respuesta_min` siguen existiendo (nullable)
--    para fuentes que sí los traigan.
--  * severidad / clima / calzada quedan como texto SIN CHECK: sus valores dependen de los enums
--    de Java, que todavía se están ajustando. La validación vive en DataValidator.
--  * Los criterios de un filtro se guardan como JSONB (FilterCriteria tiene muchos campos
--    opcionales y puede crecer sin tener que migrar la tabla).

-- =====================================================================
-- Usuarios y sesiones (HU 29, 31)
-- =====================================================================

-- Los usuarios no se borran (ingestion_log los referencia): se desactivan.
ALTER TABLE app_user
    ADD COLUMN activo    BOOLEAN   NOT NULL DEFAULT TRUE,
    ADD COLUMN creado_en TIMESTAMP NOT NULL DEFAULT now();

-- El correo no debe distinguir mayúsculas: Ian@x.com y ian@x.com son la misma cuenta.
ALTER TABLE app_user DROP CONSTRAINT uq_app_user_email;
CREATE UNIQUE INDEX uq_app_user_email_lower ON app_user (lower(email)) TABLESPACE ${ts_index};

-- Lista de tokens JWT revocados. El cierre de sesión (HU 31) debe invalidar la sesión
-- activa, y un JWT por sí solo no se puede "borrar": se guarda su jti hasta que expire.
-- AuthManager.checkPermission debe rechazar cualquier token cuyo jti esté aquí.
CREATE TABLE revoked_token (
    jti        VARCHAR(64) NOT NULL,
    usuario_id BIGINT      NOT NULL,
    expira_en  TIMESTAMP   NOT NULL,
    CONSTRAINT pk_revoked_token         PRIMARY KEY (jti) USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT fk_revoked_token_usuario FOREIGN KEY (usuario_id) REFERENCES app_user (id) ON DELETE CASCADE
) TABLESPACE ${ts_admin};

-- para limpiar periódicamente los tokens ya vencidos
CREATE INDEX idx_revoked_token_expira ON revoked_token (expira_en) TABLESPACE ${ts_index};

-- =====================================================================
-- Filtros guardados e historial de consultas (HU 22, 23)
-- =====================================================================

CREATE TABLE saved_filter (
    id         BIGSERIAL,
    usuario_id BIGINT       NOT NULL,
    nombre     VARCHAR(100) NOT NULL,
    criteria   JSONB        NOT NULL,
    creado_en  TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT pk_saved_filter         PRIMARY KEY (id)                USING INDEX TABLESPACE ${ts_index},
    -- un usuario no puede repetir el nombre de un filtro; también cubre la búsqueda por usuario
    CONSTRAINT uq_saved_filter_nombre  UNIQUE (usuario_id, nombre)     USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT ck_saved_filter_nombre  CHECK (length(btrim(nombre)) > 0),
    CONSTRAINT fk_saved_filter_usuario FOREIGN KEY (usuario_id) REFERENCES app_user (id) ON DELETE CASCADE
) TABLESPACE ${ts_admin};

CREATE TABLE query_history (
    id         BIGSERIAL,
    usuario_id BIGINT    NOT NULL,
    fecha      TIMESTAMP NOT NULL DEFAULT now(),
    -- texto legible para la lista del historial, p. ej. "San José, 2024, Lluvia"
    resumen    TEXT      NOT NULL,
    -- criterios completos, para poder re-ejecutar la consulta (HU 23)
    criteria   JSONB     NOT NULL,
    CONSTRAINT pk_query_history         PRIMARY KEY (id) USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT fk_query_history_usuario FOREIGN KEY (usuario_id) REFERENCES app_user (id) ON DELETE CASCADE
) TABLESPACE ${ts_admin};

-- "mi historial, lo más reciente primero"
CREATE INDEX idx_query_history_usuario_fecha ON query_history (usuario_id, fecha DESC) TABLESPACE ${ts_index};

-- =====================================================================
-- Configuración del sistema (HU 30) - clase SystemConfig (Singleton)
-- =====================================================================

-- Una sola fila, garantizada por el CHECK (id = 1).
CREATE TABLE system_config (
    id              SMALLINT     NOT NULL DEFAULT 1,
    -- pesos del ISS (w1..w4 del diagrama; el prototipo los muestra como fallecidos,
    -- heridos graves, heridos leves y solo daños materiales)
    w_fallecido     NUMERIC(8,2) NOT NULL DEFAULT 10,
    w_herido_grave  NUMERIC(8,2) NOT NULL DEFAULT 5,
    w_herido_leve   NUMERIC(8,2) NOT NULL DEFAULT 2,
    w_solo_danos    NUMERIC(8,2) NOT NULL DEFAULT 1,
    -- qué valores de clima / calzada cuentan como "condición adversa" (HU 16)
    clima_adverso   TEXT[]       NOT NULL DEFAULT '{}',
    calzada_adversa TEXT[]       NOT NULL DEFAULT '{}',
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT now(),
    actualizado_por BIGINT,
    CONSTRAINT pk_system_config         PRIMARY KEY (id) USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT ck_system_config_unica   CHECK (id = 1),
    CONSTRAINT ck_system_config_pesos   CHECK (w_fallecido >= 0 AND w_herido_grave >= 0
                                               AND w_herido_leve >= 0 AND w_solo_danos >= 0),
    CONSTRAINT fk_system_config_usuario FOREIGN KEY (actualizado_por) REFERENCES app_user (id)
) TABLESPACE ${ts_admin};

-- Valores iniciales. Los pesos son PROVISIONALES: el administrador debe fijar los oficiales.
-- Los valores adversos coinciden con las categorías de COSEVI (nombres de los enums de Java).
INSERT INTO system_config (id, clima_adverso, calzada_adversa)
VALUES (1,
        ARRAY['LLUVIA', 'NEBLINA', 'LLUVIA_CON_NEBLINA'],
        ARRAY['RESBALADIZA', 'HUECOS', 'HUNDIMIENTOS']);

-- =====================================================================
-- Ingesta: detectar archivos repetidos
-- =====================================================================

-- SHA-256 del archivo cargado. COSEVI no trae un identificador por registro, así que volver
-- a subir el mismo archivo duplicaría ~93 000 siniestros y duplicaría todos los KPIs.
-- IngestionManager debe avisar (o rechazar) si ya existe una carga con el mismo checksum.
ALTER TABLE ingestion_log ADD COLUMN checksum CHAR(64);
CREATE INDEX idx_ingestion_log_checksum ON ingestion_log (checksum) TABLESPACE ${ts_index};

-- =====================================================================
-- Siniestros: columnas de COSEVI y soporte para los filtros (HU 6, 7, 8)
-- =====================================================================

-- fecha casi siempre será NULL con COSEVI, así que este índice ya no sirve
DROP INDEX idx_sinister_provincia_fecha;

ALTER TABLE sinister
    ADD COLUMN anio           SMALLINT,
    ADD COLUMN mes            SMALLINT,
    ADD COLUMN dia_semana     VARCHAR(10),   -- LUNES ... DOMINGO
    ADD COLUMN hora           SMALLINT,      -- 0-23 (de "20:00-20:59")
    ADD COLUMN franja         VARCHAR(12),   -- MADRUGADA, MANANA, TARDE, NOCHE
    ADD COLUMN tipo_accidente VARCHAR(40),   -- "Colisión con motocicleta", "Atropello a persona", ...
    ADD COLUMN tipo_ruta      VARCHAR(30),   -- Nacional, Cantonal, Ignorada, Nacional sin coordenada
    ADD COLUMN zona           VARCHAR(15),   -- Urbana, Rural, Desconocida
    ALTER COLUMN tipo_vehiculo TYPE VARCHAR(30),
    ALTER COLUMN severidad     TYPE VARCHAR(30),
    ALTER COLUMN clima         TYPE VARCHAR(30),
    ALTER COLUMN calzada       TYPE VARCHAR(30),
    ADD CONSTRAINT ck_sinister_anio CHECK (anio BETWEEN 1900 AND 2100),
    ADD CONSTRAINT ck_sinister_mes  CHECK (mes  BETWEEN 1 AND 12),
    ADD CONSTRAINT ck_sinister_hora CHECK (hora BETWEEN 0 AND 23);

-- Los KPIs y filtros solo leen registros VALIDO, por eso los índices son parciales:
-- son más pequeños y no encarecen la carga de los INCOMPLETO.
CREATE INDEX idx_sinister_geo    ON sinister (provincia, canton, distrito)
    TABLESPACE ${ts_index} WHERE calidad = 'VALIDO';
CREATE INDEX idx_sinister_tiempo ON sinister (anio, mes, dia_semana, franja)
    TABLESPACE ${ts_index} WHERE calidad = 'VALIDO';
CREATE INDEX idx_sinister_ruta   ON sinister (ruta)
    TABLESPACE ${ts_index} WHERE calidad = 'VALIDO';
