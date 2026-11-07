-- V1: tablas del esquema SIVCR (ingesta y calidad de datos, HU 1 a 5)
--
-- Los tablespaces los crea Container/Inits/PostgresInit/01-tablespaces.sql.
-- Sus nombres llegan como placeholders de Flyway (se definen en application.yml):
--   ts_data  -> tablas de gran volumen (sinister, victim)
--   ts_index -> índices, incluidos los de PRIMARY KEY y UNIQUE
--   ts_admin -> tablas pequeñas de administración (app_user, ingestion_log, quality_report)
-- Así, donde no existan los tablespaces (tests con Testcontainers, un PostgreSQL local)
-- basta con apuntar los tres a pg_default.

-- =====================================================================
-- Administración
-- =====================================================================

CREATE TABLE app_user (
    id            BIGSERIAL,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol           VARCHAR(20)  NOT NULL,
    CONSTRAINT pk_app_user       PRIMARY KEY (id)    USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT uq_app_user_email UNIQUE (email)      USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT ck_app_user_rol   CHECK (rol IN ('ADMIN', 'ANALISTA', 'CONSULTOR'))
) TABLESPACE ${ts_admin};

CREATE TABLE ingestion_log (
    id             BIGSERIAL,
    fecha          TIMESTAMP   NOT NULL DEFAULT now(),
    fuente         VARCHAR(10) NOT NULL,
    nombre_archivo VARCHAR(255),
    -- nace como FALLIDA y se actualiza al terminar la carga, así una carga que
    -- explota a mitad de camino también queda registrada (HU 5)
    resultado      VARCHAR(10) NOT NULL DEFAULT 'FALLIDA',
    mensaje        TEXT,
    usuario_id     BIGINT      NOT NULL,
    CONSTRAINT pk_ingestion_log           PRIMARY KEY (id) USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT ck_ingestion_log_fuente    CHECK (fuente IN ('COSEVI', 'MOPT', 'INEC', 'IMN')),
    CONSTRAINT ck_ingestion_log_resultado CHECK (resultado IN ('EXITOSA', 'PARCIAL', 'FALLIDA')),
    CONSTRAINT fk_ingestion_log_usuario   FOREIGN KEY (usuario_id) REFERENCES app_user (id)
) TABLESPACE ${ts_admin};

CREATE TABLE quality_report (
    id               BIGSERIAL,
    ingestion_log_id BIGINT NOT NULL,
    validos          INT    NOT NULL DEFAULT 0,
    incompletos      INT    NOT NULL DEFAULT 0,
    corruptos        INT    NOT NULL DEFAULT 0,
    -- solo los primeros 500-1000 errores; los contadores de arriba son los exactos
    errores          JSONB  NOT NULL DEFAULT '[]',
    CONSTRAINT pk_quality_report     PRIMARY KEY (id)               USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT uq_quality_report_log UNIQUE (ingestion_log_id)      USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT fk_quality_report_log FOREIGN KEY (ingestion_log_id) REFERENCES ingestion_log (id) ON DELETE CASCADE
) TABLESPACE ${ts_admin};

-- =====================================================================
-- Siniestros
-- =====================================================================

-- Secuencias explícitas (no BIGSERIAL) para que Hibernate pueda hacer batch insert.
-- INCREMENT BY 50 coincide con el allocationSize por defecto de Hibernate 6.
CREATE SEQUENCE sinister_seq INCREMENT BY 50;

CREATE TABLE sinister (
    id                   BIGINT NOT NULL,
    ingestion_log_id     BIGINT NOT NULL,
    -- solo se guardan VALIDO e INCOMPLETO; los CORRUPTO únicamente se cuentan en quality_report.
    -- Los KPIs futuros deben filtrar calidad = 'VALIDO'
    calidad              VARCHAR(10) NOT NULL,
    fecha                TIMESTAMP,
    provincia            VARCHAR(20),
    canton               VARCHAR(80),
    distrito             VARCHAR(80),
    ruta                 VARCHAR(40),
    km                   DOUBLE PRECISION,
    lat                  DOUBLE PRECISION,
    lon                  DOUBLE PRECISION,
    tipo_vehiculo        VARCHAR(20),
    severidad            VARCHAR(20),
    clima                VARCHAR(20),
    calzada              VARCHAR(20),
    tiempo_respuesta_min DOUBLE PRECISION,
    CONSTRAINT pk_sinister               PRIMARY KEY (id) USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT ck_sinister_calidad       CHECK (calidad IN ('VALIDO', 'INCOMPLETO')),
    CONSTRAINT fk_sinister_ingestion_log FOREIGN KEY (ingestion_log_id) REFERENCES ingestion_log (id)
) TABLESPACE ${ts_data};

CREATE SEQUENCE victim_seq INCREMENT BY 50;

CREATE TABLE victim (
    id          BIGINT NOT NULL,
    sinister_id BIGINT NOT NULL,
    edad        INT,
    genero      VARCHAR(12),
    condicion   VARCHAR(20),
    CONSTRAINT pk_victim          PRIMARY KEY (id) USING INDEX TABLESPACE ${ts_index},
    CONSTRAINT fk_victim_sinister FOREIGN KEY (sinister_id) REFERENCES sinister (id) ON DELETE CASCADE
) TABLESPACE ${ts_data};

-- =====================================================================
-- Índices (todos en ts_index)
-- =====================================================================

CREATE INDEX idx_sinister_ingestion_log ON sinister (ingestion_log_id)    TABLESPACE ${ts_index};
CREATE INDEX idx_sinister_provincia_fecha ON sinister (provincia, fecha)  TABLESPACE ${ts_index};
CREATE INDEX idx_victim_sinister          ON victim (sinister_id)         TABLESPACE ${ts_index};