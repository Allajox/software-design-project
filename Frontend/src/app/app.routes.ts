import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';
import { API_CONFIG } from './core/config/api.config';
import { AuthService } from './core/services/auth.service';
import {
  ROLES_ANALISIS, ROLES_DASHBOARD, ROLES_INGESTA, ROLES_REGISTROS, SOLO_ADMIN, rutaInicial,
} from './core/config/roles.config';

export const routes: Routes = [
  {
    path: 'publico',
    loadComponent: () =>
      import('./features/publico/publico.component').then((m) => m.PublicoComponent),
  },
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
      // cada rol empieza en lo suyo: el dashboard, o la vista pública si su rol no tiene dashboard
      { path: '', pathMatch: 'full', redirectTo: () => rutaInicial(inject(AuthService).usuario()?.rol) },

      // ----- Fase 1 -----
      {
        path: 'dashboard',
        canActivate: [roleGuard(ROLES_DASHBOARD)],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'registros',
        canActivate: [roleGuard(ROLES_REGISTROS)],
        // Con datosReales: lee del servidor (POST /records/search). Si no, la versión de demostración.
        loadComponent: () =>
          API_CONFIG.datosReales
            ? import('./features/registros-api/registros-api.component').then((m) => m.RegistrosApiComponent)
            : import('./features/registros/registros.component').then((m) => m.RegistrosComponent),
      },
      {
        path: 'historial',
        canActivate: [roleGuard(ROLES_ANALISIS)],
        loadComponent: () =>
          API_CONFIG.datosReales
            ? import('./features/historial-api/historial-api.component').then((m) => m.HistorialApiComponent)
            : import('./features/historial/historial.component').then((m) => m.HistorialComponent),
      },
      {
        path: 'ingesta',
        canActivate: [roleGuard(ROLES_INGESTA)],
        loadComponent: () =>
          API_CONFIG.datosReales
            ? import('./features/ingesta-api/ingesta-api.component').then((m) => m.IngestaApiComponent)
            : import('./features/ingesta/ingesta.component').then((m) => m.IngestaComponent),
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
        // Con el servidor: cuentas (/users) y pesos del ISS (/config). Con la demostración: las cuentas simuladas.
        loadComponent: () =>
          API_CONFIG.useMock
            ? import('./features/usuarios/usuarios.component').then((m) => m.UsuariosComponent)
            : import('./features/usuarios-api/usuarios-api.component').then((m) => m.UsuariosApiComponent),
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
