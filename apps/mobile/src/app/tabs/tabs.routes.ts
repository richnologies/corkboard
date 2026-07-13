import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'places',
        loadComponent: () =>
          import('../pages/places/places.page').then((m) => m.PlacesPage),
      },
      {
        path: 'discover',
        loadComponent: () =>
          import('../pages/discover/discover.page').then((m) => m.DiscoverPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('../pages/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: '',
        redirectTo: 'places',
        pathMatch: 'full',
      },
    ],
  },
];
