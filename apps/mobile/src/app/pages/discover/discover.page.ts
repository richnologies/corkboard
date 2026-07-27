import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  chatbubbleEllipsesOutline,
  sendOutline,
} from 'ionicons/icons';
import {
  AssistantService,
  ChatMessage,
  ConfirmedMapPlace,
  MapPlaceCandidate,
} from '../../core/services/assistant.service';
import { MediaService } from '../../core/services/media.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ImagePrepareError, prepareImageFile } from '../../shared/utils/image-resize';

addIcons({ chatbubbleEllipsesOutline, sendOutline, cameraOutline });

interface PendingPhoto {
  id: string;
  full: File;
  thumb: File;
  previewUrl: string;
}

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonFooter,
    IonButton,
    IonIcon,
    IonSpinner,
    IonChip,
    IonTextarea,
    TranslatePipe,
  ],
  templateUrl: './discover.page.html',
  styleUrl: './discover.page.scss',
})
export class DiscoverPage {
  @ViewChild('chatScroll') chatScroll?: ElementRef<HTMLDivElement>;

  private readonly assistant = inject(AssistantService);
  private readonly media = inject(MediaService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly pendingPhotos = signal<PendingPhoto[]>([]);
  readonly photoError = signal<string | null>(null);
  private confirmedMapPlace: ConfirmedMapPlace | undefined;

  readonly examplePrompts = [
    'chat.exampleLastVisit',
    'chat.exampleNewVisit',
    'chat.exampleWhoWith',
  ] as const;

  onDraftInput(event: Event) {
    const value = (event.target as HTMLIonTextareaElement).value;
    this.draft.set(typeof value === 'string' ? value : '');
  }

  useExample(key: (typeof this.examplePrompts)[number]) {
    this.draft.set(this.i18n.t(key));
  }

  confirmMapCandidate(candidate: MapPlaceCandidate) {
    this.confirmedMapPlace = {
      googlePlaceId: candidate.googlePlaceId,
      name: candidate.name,
    };
    this.draft.set(
      this.i18n.t('chat.confirmMapPlace', { name: candidate.name }),
    );
    void this.send();
  }

  async onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    this.photoError.set(null);
    const next: PendingPhoto[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { full, thumb } = await prepareImageFile(file);
        next.push({
          id: crypto.randomUUID(),
          full,
          thumb,
          previewUrl: URL.createObjectURL(thumb),
        });
      } catch (error) {
        if (error instanceof ImagePrepareError && error.code === 'IMAGE_TOO_LARGE') {
          this.photoError.set('item.photoTooLarge');
        } else {
          this.photoError.set('item.photoProcessingFailed');
        }
      }
    }

    if (next.length) {
      this.pendingPhotos.update((current) => [...current, ...next]);
    }
    input.value = '';
  }

  removePendingPhoto(id: string) {
    this.pendingPhotos.update((photos) => {
      const removed = photos.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return photos.filter((photo) => photo.id !== id);
    });
  }

  async send() {
    const text = this.draft().trim();
    const photos = this.pendingPhotos();
    if ((!text && !photos.length) || this.sending()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text || this.i18n.t('chat.photosOnly'),
      photoPreviewUrls: photos.map((photo) => photo.previewUrl),
    };

    this.messages.update((current) => [...current, userMessage]);
    this.draft.set('');
    this.sending.set(true);
    this.scrollToBottom();

    try {
      const photoKeys: string[] = [];
      for (const photo of photos) {
        const uploaded = await this.media.uploadPhoto(photo.full, photo.thumb);
        photoKeys.push(uploaded.key);
      }
      this.clearPendingPhotos();

      const history = this.messages();
      const confirmedMapPlace = this.confirmedMapPlace;
      this.confirmedMapPlace = undefined;
      this.assistant
        .chat(history, photoKeys, confirmedMapPlace, this.i18n.locale())
        .subscribe({
        next: (response) => {
          this.messages.update((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: response.message,
              relatedItems: response.relatedItems,
              placeCandidates: response.placeCandidates,
            },
          ]);
          this.sending.set(false);
          this.scrollToBottom();
        },
        error: (error) => {
          const body = error?.error;
          let detail = this.i18n.t('chat.errorGeneric');
          if (typeof body?.message === 'string') detail = body.message;
          else if (Array.isArray(body?.message)) detail = body.message.join(', ');
          this.messages.update((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: detail,
              error: true,
            },
          ]);
          this.sending.set(false);
          this.scrollToBottom();
        },
      });
    } catch {
      this.sending.set(false);
      this.photoError.set('item.photoProcessingFailed');
    }
  }

  openItem(id: string) {
    this.router.navigate(['/item', id]);
  }

  private clearPendingPhotos() {
    for (const photo of this.pendingPhotos()) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    this.pendingPhotos.set([]);
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      const element = this.chatScroll?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
