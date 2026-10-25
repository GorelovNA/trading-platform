import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    title: 'Market dashboard | Trading Platform',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((module) => module.Dashboard),
  },
  {
    path: 'settings',
    title: 'Producer settings | Trading Platform',
    loadComponent: () => import('./features/settings/settings').then((module) => module.Settings),
  },
  { path: '**', redirectTo: 'dashboard' },
];
