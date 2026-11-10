import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AvisosService } from '../services/avisos.service';
import { RolUsuario } from '../models/auth.models';
import { rutaInicial } from '../config/roles.config';

/** Solo deja pasar a usuarios con sesión; si no, los manda a /login */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.estaAutenticado()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Si ya hay sesión, no tiene sentido ver el login */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.estaAutenticado() ? router.createUrlTree([rutaInicial(auth.usuario()?.rol)]) : true;
};

/**
 * Fábrica: restringe una ruta a ciertos roles (RF-9). Si el rol no alcanza, devuelve a la pantalla inicial de su rol
 * (el dashboard, o la vista pública si su rol no tiene dashboard) y lo avisa: un rebote en silencio parece un error.
 * OJO: esto es comodidad de uso, no seguridad. La seguridad real es que el servidor revise el rol en cada petición.
 */
export const roleGuard = (rolesPermitidos: RolUsuario[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const avisos = inject(AvisosService);

  if (auth.tieneRol(rolesPermitidos)) return true;
  avisos.info('Su rol no tiene acceso a esa pantalla.');
  return router.createUrlTree([rutaInicial(auth.usuario()?.rol)]);
};
