import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import { MenuController } from '@ionic/angular/standalone';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  cameraOutline,
  chatbubbleEllipsesOutline,
  micOutline,
  sendOutline,
  trashOutline,
} from 'ionicons/icons';
import { CompanionAmbiguity, CompanionNameResolution, ConversationMessage, ConversationSummary } from '@org/domain';
import {
  AssistantService,
  ChatMessage,
  ConfirmedMapPlace,
  MapPlaceCandidate,
  PendingVisitAction,
} from '../../core/services/assistant.service';
import { ConversationsService } from '../../core/services/conversations.service';
import { SpeechInputService } from '../../core/services/speech-input.service';
import { MediaService } from '../../core/services/media.service';
import { PhotoUrlService } from '../../core/services/photo-url.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  IMAGE_ACCEPT,
  ImagePrepareError,
  isImageFile,
  prepareImageFile,
} from '../../shared/utils/image-resize';

addIcons({
  chatbubbleEllipsesOutline,
  sendOutline,
  cameraOutline,
  micOutline,
  addOutline,
  trashOutline,
});

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
    DatePipe,
    IonMenu,
    IonMenuButton,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonFooter,
    IonButton,
    IonIcon,
    IonSpinner,
    IonChip,
    IonTextarea,
    IonList,
    IonItem,
    IonLabel,
    TranslatePipe,
  ],
  templateUrl: './discover.page.html',
  styleUrl: './discover.page.scss',
})
export class DiscoverPage implements OnInit, OnDestroy, ViewWillEnter {
  @ViewChild('chatContent') chatContent?: IonContent;

  readonly imageAccept = IMAGE_ACCEPT;

  private readonly assistant = inject(AssistantService);
  private readonly conversationsService = inject(ConversationsService);
  private readonly speech = inject(SpeechInputService);
  private readonly media = inject(MediaService);
  private readonly photoUrls = inject(PhotoUrlService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly menu = inject(MenuController);

  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly pendingPhotos = signal<PendingPhoto[]>([]);
  readonly photoError = signal<string | null>(null);
  readonly speechError = signal<string | null>(null);
  readonly speechSupported = this.speech.supported;
  readonly speechListening = this.speech.listening;
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly conversationsLoading = signal(true);
  readonly conversationId = signal<string | null>(null);
  readonly activeTitle = signal<string | null>(null);

  private confirmedMapPlace: ConfirmedMapPlace | undefined;
  private companionResolutions: CompanionNameResolution[] = [];
  private pendingVisit: PendingVisitAction | undefined;

  readonly examplePrompts = [
    'chat.exampleLastVisit',
    'chat.exampleNewVisit',
    'chat.exampleWhoWith',
  ] as const;

  ngOnInit() {
    this.loadConversations();
    void this.speech.detectSupport();
  }

  ngOnDestroy() {
    void this.speech.stop();
  }

  ionViewWillEnter() {
    this.loadConversations();
  }

  photoUrl(key: string | undefined): string | undefined {
    return this.photoUrls.url(key);
  }

  onDraftInput(event: Event) {
    const value = (event.target as HTMLIonTextareaElement).value;
    this.draft.set(typeof value === 'string' ? value : '');
  }

  useExample(key: (typeof this.examplePrompts)[number]) {
    this.draft.set(this.i18n.t(key));
  }

  async startNewChat() {
    await this.speech.stop();
    this.resetChatState();
    await this.menu.close('chat-history');
  }

  openConversation(id: string) {
    this.conversationsService.get(id).subscribe({
      next: (conversation) => {
        this.conversationId.set(conversation.id);
        this.activeTitle.set(conversation.title);
        this.messages.set(conversation.messages.map((message) => this.mapStoredMessage(message)));
        this.companionResolutions = [];
        this.pendingVisit = undefined;
        this.confirmedMapPlace = undefined;
        void this.menu.close('chat-history');
        this.scrollToBottom();
      },
    });
  }

  removeConversation(event: Event, id: string) {
    event.stopPropagation();
    this.conversationsService.remove(id).subscribe({
      next: () => {
        if (this.conversationId() === id) {
          this.resetChatState();
        }
        this.loadConversations();
      },
    });
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

  confirmCompanion(
    ambiguity: CompanionAmbiguity,
    personId: string,
    pendingVisit: PendingVisitAction,
  ) {
    this.companionResolutions.push({ query: ambiguity.query, personId });
    this.pendingVisit = pendingVisit;
    void this.sendCompanionConfirmation();
  }

  confirmCompanionNew(
    ambiguity: CompanionAmbiguity,
    pendingVisit: PendingVisitAction,
  ) {
    this.companionResolutions.push({ query: ambiguity.query, createNew: true });
    this.pendingVisit = pendingVisit;
    void this.sendCompanionConfirmation();
  }

  async onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    this.photoError.set(null);
    const next: PendingPhoto[] = [];

    for (const file of Array.from(files)) {
      if (!isImageFile(file)) continue;
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

  async toggleVoiceInput() {
    if (this.sending()) return;

    if (this.speech.listening()) {
      await this.speech.stop();
      if (this.draft().trim()) {
        await this.send();
      }
      return;
    }

    this.speechError.set(null);
    const result = await this.speech.toggle(this.i18n.locale(), (text) => {
      this.draft.set(text);
    });

    if (result === 'denied') {
      this.speechError.set('chat.speechDenied');
    } else if (result === 'unsupported') {
      this.speechError.set('chat.speechUnsupported');
    }
  }

  async send() {
    if (this.speech.listening()) {
      await this.speech.stop();
    }
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
    await this.dispatchChat(photos);
  }

  private async sendCompanionConfirmation() {
    if (this.sending() || !this.pendingVisit) return;
    await this.dispatchChat([]);
  }

  private async dispatchChat(photos: PendingPhoto[]) {
    this.sending.set(true);
    this.scrollToBottom();

    try {
      const photoKeys: string[] = [];
      for (const photo of photos) {
        const uploaded = await this.media.uploadPhoto(photo.full, photo.thumb);
        photoKeys.push(uploaded.key);
      }
      if (photos.length) {
        this.clearPendingPhotos();
      }

      const history = this.messages();
      const confirmedMapPlace = this.confirmedMapPlace;
      const confirmedCompanions = this.companionResolutions.length
        ? [...this.companionResolutions]
        : undefined;
      const pendingVisit = this.pendingVisit;
      const conversationId = this.conversationId();

      this.confirmedMapPlace = undefined;

      this.assistant
        .chat(
          history,
          photoKeys,
          {
            conversationId,
            confirmedMapPlace,
            confirmedCompanions,
            pendingVisit,
          },
          this.i18n.locale(),
        )
        .subscribe({
          next: (response) => {
            if (response.conversationId) {
              this.conversationId.set(response.conversationId);
            }
            if (response.title) {
              this.activeTitle.set(response.title);
            }

            if (response.pendingVisit) {
              this.pendingVisit = response.pendingVisit;
            } else {
              this.pendingVisit = undefined;
              this.companionResolutions = [];
            }

            this.messages.update((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: response.message,
                relatedItems: response.relatedItems,
                placeCandidates: response.placeCandidates,
                companionAmbiguities: response.companionAmbiguities,
                pendingVisit: response.pendingVisit,
              },
            ]);
            this.sending.set(false);
            this.loadConversations();
            this.scheduleTitleRefresh();
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

  private mapStoredMessage(message: ConversationMessage): ChatMessage {
    if (message.photoKeys?.length) {
      this.photoUrls.ensureMany(message.photoKeys);
    }
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      photoKeys: message.photoKeys,
      relatedItems: message.metadata?.relatedItems,
      placeCandidates: message.metadata?.placeCandidates,
      companionAmbiguities: message.metadata?.companionAmbiguities,
      pendingVisit: message.metadata?.pendingVisit,
      error: message.metadata?.error,
    };
  }

  private resetChatState() {
    void this.speech.stop();
    this.speechError.set(null);
    this.conversationId.set(null);
    this.activeTitle.set(null);
    this.messages.set([]);
    this.draft.set('');
    this.companionResolutions = [];
    this.pendingVisit = undefined;
    this.confirmedMapPlace = undefined;
    this.clearPendingPhotos();
  }

  private loadConversations() {
    this.conversationsLoading.set(true);
    this.conversationsService.list().subscribe({
      next: (conversations) => {
        this.conversations.set(conversations);
        this.conversationsLoading.set(false);
        const activeId = this.conversationId();
        if (activeId) {
          const active = conversations.find((entry) => entry.id === activeId);
          if (active) this.activeTitle.set(active.title);
        }
      },
      error: () => this.conversationsLoading.set(false),
    });
  }

  private scheduleTitleRefresh() {
    window.setTimeout(() => this.loadConversations(), 2500);
  }

  private clearPendingPhotos() {
    for (const photo of this.pendingPhotos()) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    this.pendingPhotos.set([]);
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      void this.chatContent?.scrollToBottom(200);
    });
  }
}
