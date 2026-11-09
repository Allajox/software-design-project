# Contenedores de SIVCR

Comandos para WSL. Todos se ejecutan desde esta carpeta:

```bash
cd /mnt/c/Users/ian/Documents/GitHub/software-design-project/Backend/Containers
```

## Ingesta de datos (Bloque A): levantar y probar


1. Base de datos + backend (perfil `dev`, que acepta los tokens simulados del login de Angular):

   ```bash
   docker compose up -d --build
   ```

   Flyway aplica las migraciones al arrancar (incluida `V3__ingesta_personas_perfil_omitidos.sql`).

2. Frontend (en otra terminal, desde `Frontend/`):

   ```bash
   npm install
   npm start
   ```

   Inicie sesión como `admin@sivcr.go.cr` / `Admin123` y abra `http://localhost:4200/ingestion`.

3. Probar por API (token de desarrollo del usuario ADMIN):

   ```bash
   curl -H "Authorization: Bearer mock-jwt-1" -F fuente=COSEVI \
        -F file=@../SIVCR/src/test/resources/muestras/SINTETICO-cosevi-siniestros.csv \
        http://localhost:8080/api/ingestion/upload
   curl -H "Authorization: Bearer mock-jwt-1" http://localhost:8080/api/ingestion/history
   curl -H "Authorization: Bearer mock-jwt-1" http://localhost:8080/api/ingestion/1/quality-report
   ```

   Con `mock-jwt-2` (analista) cualquiera de las tres debe responder 403.

4. Pruebas (requieren JDK 25, Maven y Docker para Testcontainers):

   ```bash
   cd ../SIVCR
   mvn test      # unitarias: validador, parsers, fábrica, manager
   mvn verify    # incluye IngestionFlowIT (Postgres real)
   ```

Los archivos de `src/test/resources/muestras/` son **sintéticos**; los datos reales de COSEVI/INEC no se incluyen en el repositorio.

## Levanta primera vez

```bash
docker compose up -d --build postgres
```

## Levantar

```bash
docker compose up -d postgres
```

## Parar

```bash
docker compose stop
```

## Parar y eliminar datos

```bash
docker compose down -v
```

## Eliminar todo

```bash
docker compose down -v --rmi all
```
