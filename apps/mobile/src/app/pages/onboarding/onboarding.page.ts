import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mapOutline, wineOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ mapOutline, wineOutline });

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [TranslatePipe, IonContent, IonButton, IonIcon, IonText, IonSpinner],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  readonly skipping = signal(false);
  readonly error = signal('');

  choosePlace() {
    void this.router.navigate(['/item/new'], {
      queryParams: { category: 'restaurant', onboarding: '1' },
    });
  }

  chooseWine() {
    void this.router.navigate(['/item/new'], {
      queryParams: { category: 'wine', onboarding: '1' },
    });
  }

  skip() {
    this.skipping.set(true);
    this.error.set('');
    this.auth.completeOnboarding().subscribe({
      next: () => {
        this.skipping.set(false);
        void this.router.navigateByUrl('/tabs/places');
      },
      error: () => {
        this.skipping.set(false);
        this.error.set(this.i18n.t('onboarding.errors.skipFailed'));
      },
    });
  }
}
