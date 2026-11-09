import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';
import { ROLES_ANALISIS, SOLO_ADMIN, TODOS_LOS_ROLES } from './core/config/roles.config';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },

  // Todo lo que está dentro del layout (menú lateral + barra superior) exige sesión
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      // ----- Fase 1 -----
      {
        path: 'dashboard',
        canActivate: [roleGuard(TODOS_LOS_ROLES)],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'registros',
        canActivate: [roleGuard(TODOS_LOS_ROLES)],
        loadComponent: () =>
          import('./features/registros/registros.component').then((m) => m.RegistrosComponent),
      },
      {
        path: 'historial',
        canActivate: [roleGuard(ROLES_ANALISIS)],
        loadComponent: () =>
          import('./features/historial/historial.component').then((m) => m.HistorialComponent),
      },
      {
        path: 'ingesta',
        canActivate: [roleGuard(ROLES_ANALISIS)],
        loadComponent: () =>
          import('./features/ingesta/ingesta.component').then((m) => m.IngestaComponent),
      },

      // ----- Fase 2 -----
      {
        path: 'hotspots',
        canActivate: [roleGuard(ROLES_ANALISIS)],
        loadComponent: () =>
          import('./features/hotspots/hotspots.component').then((m) => m.HotspotsComponent),
      },
      {
        path: 'riesgo',
        canActivate: [roleGuard(ROLES_ANALISIS)],
        loadComponent: () =>
          import('./features/riesgo/riesgo.component').then((m) => m.RiesgoComponent),
      },
      {
        path: 'simulador',
        canActivate: [roleGuard(ROLES_ANALISIS)],
        loadComponent: () =>
          import('./features/simulador/simulador.component').then((m) => m.SimuladorComponent),
      },
      {
        path: 'usuarios',
        canActivate: [roleGuard(SOLO_ADMIN)],
        loadComponent: () =>
          import('./features/usuarios/usuarios.component').then((m) => m.UsuariosComponent),
      },

      // Cualquier otra dirección: página 404 dentro del layout (el menú sigue disponible).
      // Si no hay sesión, authGuard manda primero al login.
      {
        path: '**',
        loadComponent: () =>
          import('./features/no-encontrada/no-encontrada.component').then((m) => m.NoEncontradaComponent),
      },
    ],
  },
];
