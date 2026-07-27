import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline, closeOutline } from 'ionicons/icons';
import { PhotoUrlService } from '../../core/services/photo-url.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ closeOutline, chevronBackOutline, chevronForwardOutline });

export interface LightboxPhoto {
  key?: string;
  thumbKey?: string;
  blobUrl?: string;
  fullBlobUrl?: string;
  notes?: string;
}

@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    TranslatePipe,
  ],
  template: `
    <ion-modal [isOpen]="isOpen()" (didDismiss)="closed.emit()">
      <ng-template>
        <ion-header>
          <ion-toolbar color="dark">
            <ion-title>
              @if (photos().length > 1) {
                {{ index() + 1 }} / {{ photos().length }}
              } @else {
                {{ 'item.visitPhoto' | translate }}
              }
            </ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="closed.emit()">
                <ion-icon slot="icon-only" name="close-outline" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="photo-lightbox" color="dark">
          <div class="photo-lightbox-stage">
            @if (currentSrc(); as src) {
              <img [src]="src" [alt]="currentPhoto()?.notes || ('item.visitPhoto' | translate)" />
            } @else {
              <ion-spinner name="crescent" color="light" />
            }
          </div>

          @if (photos().length > 1) {
            <div class="photo-lightbox-nav">
              <ion-button
                fill="clear"
                color="light"
                [disabled]="index() === 0"
                (click)="previous()"
              >
                <ion-icon slot="icon-only" name="chevron-back-outline" />
              </ion-button>
              <ion-button
                fill="clear"
                color="light"
                [disabled]="index() >= photos().length - 1"
                (click)="next()"
              >
                <ion-icon slot="icon-only" name="chevron-forward-outline" />
              </ion-button>
            </div>
          }

          @if (currentPhoto()?.notes) {
            <p class="photo-lightbox-caption">{{ currentPhoto()!.notes }}</p>
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .photo-lightbox {
      --background: #000;
    }

    .photo-lightbox-stage {
      min-height: calc(100% - 80px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;

      img {
        max-width: 100%;
        max-height: 70vh;
        object-fit: contain;
        border-radius: 8px;
      }
    }

    .photo-lightbox-nav {
      display: flex;
      justify-content: center;
      gap: 24px;
      padding-bottom: 8px;
    }

    .photo-lightbox-caption {
      margin: 0;
      padding: 0 20px 24px;
      text-align: center;
      color: rgba(255, 255, 255, 0.82);
      font-size: 14px;
      line-height: 1.4;
    }
  `,
})
export class PhotoLightboxComponent {
  private readonly photoUrls = inject(PhotoUrlService);

  readonly isOpen = input(false);
  readonly photos = input<LightboxPhoto[]>([]);
  readonly initialIndex = input(0);
  readonly closed = output<void>();

  readonly index = signal(0);

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        untracked(() => this.index.set(this.initialIndex()));
      }
    });

    effect(() => {
      if (!this.isOpen()) return;
      this.index();
      this.photos();
      this.ensureCurrentUrl();
    });
  }

  readonly currentPhoto = computed(() => this.photos()[this.index()]);

  readonly currentSrc = computed(() => {
    const photo = this.currentPhoto();
    if (!photo) return undefined;
    if (photo.fullBlobUrl ?? photo.blobUrl) {
      return photo.fullBlobUrl ?? photo.blobUrl;
    }
    return this.photoUrls.url(photo.key);
  });

  previous() {
    this.index.update((value) => Math.max(0, value - 1));
  }

  next() {
    this.index.update((value) => Math.min(this.photos().length - 1, value + 1));
  }

  private ensureCurrentUrl() {
    const photo = this.currentPhoto();
    if (!photo?.key) return;
    this.photoUrls.ensure(photo.key);
  }
}