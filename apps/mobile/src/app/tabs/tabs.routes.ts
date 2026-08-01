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
        path: 'wines',
        loadComponent: () =>
          import('../pages/wines/wines.page').then((m) => m.WinesPage),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('../pages/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'discover',
        loadComponent: () =>
          import('../pages/discover/discover.page').then((m) => m.DiscoverPage),
      },
      {
        path: 'people',
        loadComponent: () =>
          import('../pages/people/people.page').then((m) => m.PeoplePage),
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
