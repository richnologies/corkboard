import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  keyOutline,
  logOutOutline,
  peopleOutline,
  personCircleOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppLocale, isAppLocale } from '../../core/i18n/locale';

addIcons({
  keyOutline,
  logOutOutline,
  peopleOutline,
  personCircleOutline,
  chevronForwardOutline,
});

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (!password || !confirm) return null;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
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
    IonInput,
    IonText,
    IonSpinner,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly passwordLoading = signal(false);
  readonly passwordError = signal('');
  readonly passwordSuccess = signal(false);

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  openPeople() {
    this.router.navigate(['/tabs/people']);
  }

  onLocaleChange(event: CustomEvent) {
    const value = (event.detail as { value?: string }).value;
    if (value && isAppLocale(value)) {
      this.i18n.setLocale(value as AppLocale);
    }
  }

  changePassword() {
    if (this.passwordForm.invalid || this.passwordLoading()) return;

    const { currentPassword, newPassword, confirmPassword } =
      this.passwordForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.passwordError.set(this.i18n.t('profile.errors.mismatch'));
      return;
    }
    if (currentPassword === newPassword) {
      this.passwordError.set(this.i18n.t('profile.errors.samePassword'));
      return;
    }

    this.passwordLoading.set(true);
    this.passwordError.set('');
    this.passwordSuccess.set(false);

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.passwordLoading.set(false);
        this.passwordSuccess.set(true);
        this.passwordForm.reset();
      },
      error: (err) => {
        this.passwordLoading.set(false);
        const status = err?.status;
        const message = err?.error?.message;
        if (status === 401) {
          this.passwordError.set(this.i18n.t('profile.errors.wrongPassword'));
        } else if (
          typeof message === 'string' &&
          /different from the current/i.test(message)
        ) {
          this.passwordError.set(this.i18n.t('profile.errors.samePassword'));
        } else if (typeof message === 'string') {
          this.passwordError.set(message);
        } else {
          this.passwordError.set(this.i18n.t('profile.errors.changeFailed'));
        }
      },
    });
  }

  logout() {
    this.auth.logout();
  }
}
