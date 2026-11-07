-- Tablespaces de SIVCR
--
-- Se ejecuta UNA sola vez, cuando PostgreSQL crea la base de datos desde cero
-- (carpeta /docker-entrypoint-initdb.d). Si el volumen postgres-data ya existe, no corre.
--
-- Requiere superusuario (el usuario POSTGRES_USER del contenedor lo es) y no puede
-- ejecutarse dentro de una transacción, por eso NO va en las migraciones de Flyway.
-- Los directorios los crea Container/Postgres/Dockerfile.

-- Tablas de gran volumen: sinister, victim
CREATE TABLESPACE ts_sivcr_data  LOCATION '/var/lib/postgresql/tablespaces/data';

-- Todos los índices (incluidos los de PRIMARY KEY y UNIQUE)
CREATE TABLESPACE ts_sivcr_index LOCATION '/var/lib/postgresql/tablespaces/index';

-- Tablas pequeñas de administración: app_user, ingestion_log, quality_report
CREATE TABLESPACE ts_sivcr_admin LOCATION '/var/lib/postgresql/tablespaces/admin';