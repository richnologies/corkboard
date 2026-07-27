import { Component } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mapOutline,
  calendarOutline,
  sparklesOutline,
  peopleOutline,
  personOutline,
} from 'ionicons/icons';
import { TranslatePipe } from '../core/i18n/translate.pipe';

addIcons({ mapOutline, calendarOutline, sparklesOutline, peopleOutline, personOutline });

@Component({
  selector: 'app-tabs',
  standalone: true,
  templateUrl: 'tabs.page.html',
  styleUrl: 'tabs.page.scss',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, TranslatePipe],
})
export class TabsPage {}
