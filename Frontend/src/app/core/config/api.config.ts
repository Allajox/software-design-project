export const API_CONFIG = {
  baseUrl: 'http://localhost:8080/api', // cambia por la URL de tu backend
  /**
   * false = el login (POST /auth/login), los usuarios (/users) y la configuración (/config) usan el servidor.
   * true = vuelven el login y la pantalla de usuarios de demostración, que trabajan en el navegador (sin pantalla de configuración).
   */
  useMock: false,
  /**
   * true = Registros, Historial de consultas y Carga de datos usan el servidor (baseUrl).
   * false = esas tres pantallas vuelven a la versión de demostración, que trabaja en el navegador.
   * Hotspots, Riesgo y Simulador siguen con datos de demostración hasta que existan sus endpoints.
   */
  datosReales: true,
};
