import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import { MenuController, AlertController } from '@ionic/angular/standalone';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
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
  ConfirmedWine,
  MapPlaceCandidate,
  PendingVisitAction,
  WineCandidate,
} from '../../core/services/assistant.service';
import { ConversationsService } from '../../core/services/conversations.service';
import { SpeechInputService } from '../../core/services/speech-input.service';
import { MediaService } from '../../core/services/media.service';
import { PhotoUrlService } from '../../core/services/photo-url.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ChatLinksPipe } from '../../shared/pipes/chat-links.pipe';
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
    DecimalPipe,
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
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonLabel,
    TranslatePipe,
    ChatLinksPipe,
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
  private readonly alertCtrl = inject(AlertController);

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
  private confirmedWine: ConfirmedWine | undefined;
  private companionResolutions: CompanionNameResolution[] = [];
  private pendingVisit: PendingVisitAction | undefined;
  private sessionPhotos: { key: string; thumbKey: string }[] = [];

  readonly examplePrompts = [
    'chat.exampleLastVisit',
    'chat.exampleNewVisit',
    'chat.exampleWineQuestion',
    'chat.exampleWineMemory',
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

  useSuggestedReply(reply: string) {
    if (this.sending()) return;
    this.draft.set(reply);
    void this.send();
  }

  isLatestAnswerableMessage(message: ChatMessage): boolean {
    if (message.role !== 'assistant' || this.sending()) return false;
    const messages = this.messages();
    for (let index = messages.length - 1; index >= 0; index--) {
      const entry = messages[index];
      if (entry.role === 'assistant') {
        return entry.id === message.id;
      }
    }
    return false;
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
        this.confirmedWine = undefined;
        this.sessionPhotos = [];
        void this.menu.close('chat-history');
        this.scrollToBottom();
      },
    });
  }

  async confirmDeleteConversation(id: string) {
    const alert = await this.alertCtrl.create({
      header: this.i18n.t('chat.deleteConversationTitle'),
      message: this.i18n.t('chat.deleteConversationConfirm'),
      buttons: [
        { text: this.i18n.t('common.cancel'), role: 'cancel' },
        {
          text: this.i18n.t('chat.deleteConversation'),
          role: 'destructive',
          handler: () => this.removeConversation(id),
        },
      ],
    });
    await alert.present();
  }

  removeConversation(id: string) {
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

  confirmWineCandidate(candidate: WineCandidate) {
    this.confirmedWine = {
      wineId: candidate.wineId,
      vintageId: candidate.vintageId,
      itemId: candidate.itemId,
      name: candidate.name,
    };
    this.draft.set(
      this.i18n.t('chat.confirmWine', {
        name: candidate.displayName || candidate.name,
      }),
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
      for (const photo of photos) {
        const uploaded = await this.media.uploadPhoto(photo.full, photo.thumb);
        this.sessionPhotos.push({
          key: uploaded.key,
          thumbKey: uploaded.thumbKey,
        });
      }
      if (photos.length) {
        this.clearPendingPhotos();
      }

      const photoKeys = this.sessionPhotos.map((photo) => photo.key);
      const photoThumbKeys = this.sessionPhotos.map((photo) => photo.thumbKey);

      const history = this.messages();
      const confirmedMapPlace = this.confirmedMapPlace;
      const confirmedWine = this.confirmedWine;
      const confirmedCompanions = this.companionResolutions.length
        ? [...this.companionResolutions]
        : undefined;
      const pendingVisit = this.pendingVisit;
      const conversationId = this.conversationId();

      this.confirmedMapPlace = undefined;
      this.confirmedWine = undefined;

      this.assistant
        .chat(
          history,
          photoKeys,
          {
            conversationId,
            confirmedMapPlace,
            confirmedWine,
            confirmedCompanions,
            pendingVisit,
            photoThumbKeys,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

            if (response.loggedVisit) {
              this.sessionPhotos = [];
            }

            this.messages.update((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: response.message,
                relatedItems: response.relatedItems,
                placeCandidates: response.placeCandidates,
                wineCandidates: response.wineCandidates,
                companionAmbiguities: response.companionAmbiguities,
                pendingVisit: response.pendingVisit,
                suggestedReplies: response.suggestedReplies,
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
      wineCandidates: message.metadata?.wineCandidates,
      companionAmbiguities: message.metadata?.companionAmbiguities,
      pendingVisit: message.metadata?.pendingVisit as PendingVisitAction | undefined,
      suggestedReplies: message.metadata?.suggestedReplies,
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
    this.confirmedWine = undefined;
    this.sessionPhotos = [];
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
