import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RolUsuario } from '../models/auth.models';

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

  return auth.estaAutenticado() ? router.createUrlTree(['/dashboard']) : true;
};

/** Fábrica: restringe una ruta a ciertos roles (RF-9) */
export const roleGuard = (rolesPermitidos: RolUsuario[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.tieneRol(rolesPermitidos) ? true : router.createUrlTree(['/dashboard']);
};
