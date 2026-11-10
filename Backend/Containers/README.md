# Contenedores de SIVCR

Comandos para WSL. Todos se ejecutan desde esta carpeta (`Backend/Containers`). La guía completa para levantar el backend y el frontend está en el [README de la raíz](../../README.md).

## Levantar todo por primera vez

Construye las imágenes, crea la base de datos y arranca el backend (perfil `dev`, que crea las cuentas de demostración). Flyway aplica las migraciones al arrancar.

```bash
docker compose up -d --build
docker compose logs -f backend
```

## Levantar

```bash
docker compose up -d
```

## Solo la base de datos

```bash
docker compose up -d --build postgres   # primera vez
docker compose up -d postgres           # después
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

## Ingesta de datos: probar por API

La carga la hace un administrador desde «Carga de datos» en el frontend, o por API con un token obtenido en el login:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"correo":"admin@sivcr.go.cr","contrasena":"Admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -H "Authorization: Bearer $TOKEN" -F fuente=COSEVI \
     -F file=@../SIVCR/src/test/resources/muestras/SINTETICO-cosevi-siniestros.csv \
     http://localhost:8080/api/ingestion/upload
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/ingestion/history
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/ingestion/1/quality-report
```

Con el token del analista (`analista@sivcr.go.cr`) cualquiera de las tres responde 403: solo el administrador puede cargar datos.

Subir otra vez el mismo archivo se rechaza por su SHA-256 («Este archivo ya se cargó en la carga n.º …»).

## Pruebas del backend

Requieren JDK 25, Maven y Docker (Testcontainers):

```bash
cd ../SIVCR
mvn test      # unitarias
mvn verify    # incluye las pruebas de integración con PostgreSQL real
```

Los archivos de `src/test/resources/muestras/` son **sintéticos**; los datos reales de COSEVI/INEC no se incluyen en las muestras.
