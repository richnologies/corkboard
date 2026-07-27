import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logOutOutline, peopleOutline, personCircleOutline } from 'ionicons/icons';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppLocale, isAppLocale } from '../../core/i18n/locale';

addIcons({ logOutOutline, peopleOutline, personCircleOutline });

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    DatePipe,
    TranslatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonButton,
    IonSelect,
    IonSelectOption,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  openPeople() {
    this.router.navigate(['/tabs/people']);
  }

  onLocaleChange(event: CustomEvent) {
    const value = (event.detail as { value?: string }).value;
    if (value && isAppLocale(value)) {
      this.i18n.setLocale(value as AppLocale);
    }
  }

  logout() {
    this.auth.logout();
  }
}
