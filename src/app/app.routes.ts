import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Trading Platform',
    loadComponent: () => import('./features/home/home').then((module) => module.Home),
  },
  { path: '**', redirectTo: '' },
];
