import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'item/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/item/item-form.page').then((m) => m.ItemFormPage),
  },
  {
    path: 'item/:id/edit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/item/item-form.page').then((m) => m.ItemFormPage),
  },
  {
    path: 'item/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/item/item-detail.page').then((m) => m.ItemDetailPage),
  },
  {
    path: 'people',
    redirectTo: 'tabs/people',
    pathMatch: 'full',
  },
  {
    path: '',
    redirectTo: 'tabs/places',
    pathMatch: 'full',
  },
];
