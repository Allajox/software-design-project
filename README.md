# software-design-project (SIVCR)

Sistema de indicadores de siniestralidad vial de Costa Rica.

| Carpeta | Qué es | Puerto |
| --- | --- | --- |
| `Backend/Containers` | Docker Compose: PostgreSQL + backend | 5432 (BD), 8080 (API) |
| `Backend/SIVCR` | Backend: Spring Boot 3.5 · Java 25 · Maven | 8080 |
| `Frontend` | Frontend: Angular 22 | 4200 |

Los comandos están escritos para WSL (Ubuntu) y se ejecutan **desde la raíz del repositorio**, la carpeta que contiene `Backend` y `Frontend`.

## Requisitos

- **Docker** funcionando en WSL (`docker ps` debe responder; si no, `sudo service docker start`).
- **Node.js** (LTS reciente) y **npm** para el frontend.
- **Java 25 y Maven** solo si corres el backend o sus pruebas fuera de Docker.

## Backend

### Primera vez

Construye las imágenes, crea la base de datos y arranca el backend. Flyway crea las tablas al iniciar.

```bash
cd Backend/Containers
docker compose up -d --build
docker compose logs -f backend      # espera "Started SivcrApplication"; Ctrl+C solo sale del log
```

Comprueba que responde:

```bash
curl -s http://localhost:8080/api/public/summary
curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"correo":"admin@sivcr.go.cr","contrasena":"Admin123"}'
```

El primero devuelve JSON sin sesión; el segundo devuelve un `token` y los datos del usuario.

### Las veces siguientes

```bash
cd Backend/Containers
docker compose up -d                 # levanta lo que ya está construido
docker compose up -d --build backend # tras cambiar código del backend
docker compose stop                  # detiene sin perder datos
docker compose down -v               # borra también la base de datos (empieza de cero)
```

- La API queda en `http://localhost:8080/api`.
- Si el puerto 5432 está ocupado por otro PostgreSQL: `POSTGRES_HOST_PORT=5433 docker compose up -d --build`.

### Backend con Maven (para depurar)

Solo la base de datos va en Docker; el backend corre con Maven (Java 25):

```bash
cd Backend/Containers
docker compose up -d --build postgres
cd ../SIVCR
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

Usa por omisión `localhost:5432`, base, usuario y contraseña `sivcr`. Si cambiaste el puerto de PostgreSQL, agrega `DB_PORT=5433` antes de `mvn`.

## Frontend

### Primera vez

```bash
cd Frontend
npm install
npm start                            # ng serve en http://localhost:4200
```

Abre `http://localhost:4200`. Ya apunta a `http://localhost:8080/api` (se cambia en `Frontend/src/app/core/config/api.config.ts`), así que el backend debe estar arriba.

### Las veces siguientes

```bash
cd Frontend
npm start
```

Vuelve a correr `npm install` solo si cambió `package.json` o `package-lock.json`.

## Cuentas de demostración

Se crean con el perfil `dev`, que es el predeterminado de `compose.yml`.

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `admin@sivcr.go.cr` | `Admin123` |
| Analista de Tránsito | `analista@sivcr.go.cr` | `Analista123` |
| Consultor Público | `consultor@sivcr.go.cr` | `Consulta123` |

- Administrador y analista entran al dashboard; el consultor solo ve la vista pública. «Ingresar sin Credenciales» abre esa misma vista sin sesión.
- Solo el administrador ve «Usuarios y Configuración» (cuentas, pesos del ISS y condiciones adversas) y puede cargar datos.
- **Solo para desarrollo.** En cualquier entorno accesible desde fuera usa `SPRING_PROFILES_ACTIVE=prod`: no se crea ninguna cuenta, el primer administrador se inserta a mano en la base y el resto se crea desde «Usuarios y Configuración».

## Datos

La base nace vacía y el dashboard muestra ceros hasta que un administrador cargue archivos desde «Carga de datos». Para probar hay muestras sintéticas en `Backend/SIVCR/src/test/resources/muestras/`. Los pasos para cargar por API están en `Backend/Containers/README.md`.

## Pruebas

```bash
cd Backend/SIVCR
mvn test        # unitarias
mvn verify      # unitarias + integración (necesita Docker: Testcontainers levanta su propio PostgreSQL)

cd Frontend
npm test        # Vitest; para una sola corrida: npx ng test --watch=false
```

## Problemas frecuentes

- **El navegador no conecta con `localhost:4200` o `8080`:** reinicia WSL (`wsl --shutdown` en PowerShell) o arranca con `npm start -- --host 0.0.0.0`.
- **`npm install` o `ng serve` se quejan de `esbuild` o `rollup`:** el `node_modules` se instaló desde Windows. En WSL ejecuta `rm -rf node_modules && npm ci`.
- **Cuentas o datos viejos:** `docker compose down -v` en `Backend/Containers` y vuelve a levantar.
- **El dashboard dice «no se pudo conectar con el servidor»:** revisa que el backend esté arriba (`docker compose ps`) y mira `docker compose logs backend`.
