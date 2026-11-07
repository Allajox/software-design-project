# Contenedores de SIVCR

Esta carpeta tiene la infraestructura de Docker del proyecto: PostgreSQL con tablespaces y, más adelante, el backend (Spring Boot).

## Requisitos

- Docker Desktop instalado y corriendo.

## Levantar la base de datos

Desde esta carpeta (`Backend/Containers`), en PowerShell:

```powershell
docker compose -f "Docker compose.yml" up -d --build postgres
```

El `-f` es necesario porque el archivo se llama `Docker compose.yml` (con espacio). Si se renombra a `compose.yml` se puede omitir.

Se levanta solo el servicio `postgres` porque el servicio `backend` todavía no se puede construir (ver "Pendiente").

La primera vez tarda un poco porque construye la imagen de PostgreSQL.

## Si ya se había levantado antes

Los tablespaces solo se crean cuando el volumen de datos se inicializa desde cero. Si se levantó el contenedor antes de que estuviera corregida la ruta de `Init/PostgresInit`, hay que borrar los volúmenes y volver a empezar:

```powershell
docker compose -f "Docker compose.yml" down -v
docker compose -f "Docker compose.yml" up -d --build postgres
```

Ojo: `-v` borra todos los datos de la base.

## Verificar que funciona

```powershell
docker compose -f "Docker compose.yml" ps
docker exec -it sivcr_postgres psql -U sivcr -d sivcr -c '\db'
```

- El primer comando debe mostrar `sivcr_postgres` como `healthy`.
- El segundo debe listar los tres tablespaces: `ts_sivcr_data`, `ts_sivcr_index` y `ts_sivcr_admin`.

## Datos de conexión

Valores por defecto (se pueden cambiar con variables de entorno):

| Dato | Valor | Variable |
|---|---|---|
| Host | `localhost` | |
| Puerto | `5432` | `POSTGRES_HOST_PORT` |
| Base de datos | `sivcr` | `DB_NAME` |
| Usuario | `sivcr` | `DB_USER` |
| Contraseña | `sivcr` | `DB_PASSWORD` |

Si ya hay un PostgreSQL local usando el puerto 5432, se puede usar otro puerto del host:

```powershell
$env:POSTGRES_HOST_PORT = 5433
docker compose -f "Docker compose.yml" up -d postgres
```

## Detener

```powershell
# detiene los contenedores y conserva los datos
docker compose -f "Docker compose.yml" down

# detiene los contenedores y BORRA los datos
docker compose -f "Docker compose.yml" down -v
```

## Estructura

| Ruta | Para qué sirve |
|---|---|
| `Docker compose.yml` | Define los servicios `postgres` y `backend`, la red y los volúmenes. |
| `Postgres/Dockerfile` | Imagen de PostgreSQL 16 con los directorios de los tablespaces. |
| `Init/PostgresInit/01-tablespaces.sql` | Crea los tablespaces la primera vez que se inicializa la base. |
| `Dockerfile` | Imagen del backend (Maven + Java 21). |

## Tablas

Las tablas **no** las crea Docker. Docker solo crea la base de datos vacía y los tablespaces. Las tablas las crean las migraciones de Flyway que están en `Backend/SIVCR/src/main/resources/db/migration/` (`V1` y `V2`), y se ejecutarán automáticamente cuando el backend arranque.

## Pendiente

El servicio `backend` del compose todavía no funciona:

- La ruta del Dockerfile es `Container/Dockerfile`, pero la carpeta se llama `Containers`.
- El argumento `PROYECTO` sigue con el valor de ejemplo `NombreCarpetaJava`; debe ser `SIVCR`.
- El `pom.xml` no tiene dependencias (Spring Boot, Flyway, driver de PostgreSQL), y falta un `application.yml` con los placeholders de Flyway (`ts_data`, `ts_index`, `ts_admin`).
- El `pom.xml` usa Java 25 pero el `Dockerfile` compila con Java 21.
