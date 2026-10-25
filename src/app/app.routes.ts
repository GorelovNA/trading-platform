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
      import('./features/dashboard/dashboard.component').then(
        (module) => module.DashboardComponent,
      ),
  },
  {
    path: 'settings',
    title: 'Producer settings | Trading Platform',
    loadComponent: () =>
      import('./features/settings/settings.component').then((module) => module.SettingsComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
