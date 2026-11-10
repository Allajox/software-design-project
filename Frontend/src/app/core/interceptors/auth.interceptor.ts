import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();
  const peticion = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(peticion).pipe(
    catchError((err: HttpErrorResponse) => {
      // Token vencido o inválido: cerrar sesión y volver al login. Solo si la petición llevaba un token: un 401 sin
      // token no es una sesión que se venció (la vista pública, por ejemplo, la abre quien no ha iniciado sesión).
      if (err.status === 401 && token && !req.url.includes('/auth/login') && !req.url.includes('/auth/logout')) {
        auth.logout(false);
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
