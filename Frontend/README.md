# SIVCR – Frontend (Angular)

Frontend del Sistema de Información y Predictibilidad Vial de Costa Rica.
Por ahora incluye el **login**, protección de rutas por sesión y un dashboard temporal.

## Requisitos

- Node.js 20.19 o superior (`node -v`)
- Visual Studio Code
- Extensión recomendada: **Angular Language Service** (VS Code la sugiere al abrir la carpeta)

## Correr el proyecto en Visual Studio Code

1. Descomprime el zip y abre VS Code.
2. `Archivo > Abrir carpeta...` y elige la carpeta `sivcr-frontend`.
3. Abre la terminal integrada: `Ctrl + ñ` (o `Terminal > Nueva terminal`).
4. Instala las dependencias (solo la primera vez):

   ```bash
   npm install
   ```

5. Inicia el servidor de desarrollo:

   ```bash
   npm start
   ```

6. Abre http://localhost:4200 en el navegador. La página se recarga sola al guardar cambios.

Para detener el servidor: `Ctrl + C` en la terminal.

### Alternativa: con F5 (depurar con Chrome)

`Ejecutar y depurar` (`Ctrl + Shift + D`) > configuración **ng serve** > `F5`.
Levanta el servidor y abre Chrome con el depurador conectado, así puedes poner puntos de interrupción en los `.ts`.

## Usuarios de prueba

Mientras `useMock` esté en `true` (archivo `src/app/core/config/api.config.ts`):

| Rol                  | Correo                  | Contraseña   |
| -------------------- | ----------------------- | ------------ |
| Administrador        | admin@sivcr.go.cr       | Admin123     |
| Analista de Tránsito | analista@sivcr.go.cr    | Analista123  |
| Consultor Público    | consultor@sivcr.go.cr   | Consulta123  |

## Conectar con el backend real

En `src/app/core/config/api.config.ts`:

```ts
export const API_CONFIG = {
  baseUrl: 'http://localhost:8080/api', // URL de tu backend
  useMock: false,                       // desactiva el login simulado
};
```

El backend debe exponer `POST /auth/login`, recibir `{ correo, contrasena }` y responder
`{ token, usuario: { id, nombre, correo, rol } }`, con `rol` igual a
`ADMIN`, `ANALISTA_TRANSITO` o `CONSULTOR_PUBLICO`.

## Estructura

```
src/app/
├── core/                 lo transversal, sin pantallas
│   ├── config/           configuración de la API
│   ├── models/           interfaces y tipos (Usuario, roles, login)
│   ├── services/         AuthService (lógica de sesión, sin UI)
│   ├── guards/           authGuard, guestGuard, roleGuard
│   └── interceptors/     agrega el token a cada petición
├── features/             una carpeta por pantalla
│   ├── auth/login/
│   └── dashboard/
├── app.config.ts         providers (router, HttpClient, interceptor)
└── app.routes.ts         rutas con lazy loading
```

## Comandos útiles

| Comando       | Qué hace                                   |
| ------------- | ------------------------------------------ |
| `npm start`   | Servidor de desarrollo en el puerto 4200   |
| `npm run build` | Compila para producción en `dist/`       |
| `npm test`    | Ejecuta las pruebas unitarias (Vitest)     |

## Problemas frecuentes

- **`ng` o `npm` no se reconocen:** instala Node.js desde https://nodejs.org y reinicia VS Code.
- **El puerto 4200 está ocupado:** `npm start -- --port 4300`.
- **Errores raros tras mover la carpeta:** borra `node_modules` y `.angular`, y corre `npm install` otra vez.
