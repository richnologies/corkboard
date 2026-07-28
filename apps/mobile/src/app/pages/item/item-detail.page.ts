import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import { AlertController } from '@ionic/angular/standalone';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonInput,
  IonTextarea,
  IonToggle,
  IonRange,
  IonSelect,
  IonSelectOption,
  IonReorder,
  IonReorderGroup,
} from '@ionic/angular/standalone';
import type { ItemReorderEventDetail } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  createOutline,
  mapOutline,
  eyeOutline,
  calendarOutline,
  addCircleOutline,
  cameraOutline,
  closeCircleOutline,
  peopleOutline,
  pencilOutline,
  trashOutline,
} from 'ionicons/icons';
import { Experience, ExperiencePhoto, ExperienceVisibility, ItemHistory, ItemStatus, categoryHasLocation } from '@org/domain';
import { AuthService } from '../../core/services/auth.service';
import { ExperiencePayload, ItemsService } from '../../core/services/items.service';
import { MediaService } from '../../core/services/media.service';
import { PhotoUrlService } from '../../core/services/photo-url.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { googleMapsUrl, openStreetMapUrl, streetViewUrl } from '../../shared/maps';
import { OsmMapComponent } from '../../shared/components/osm-map.component';
import { PersonPickerComponent } from '../../shared/components/person-picker.component';
import {
  LightboxPhoto,
  PhotoLightboxComponent,
} from '../../shared/components/photo-lightbox.component';
import {
  IMAGE_ACCEPT,
  ImagePrepareError,
  isImageFile,
  prepareImageFile,
} from '../../shared/utils/image-resize';

addIcons({
  createOutline,
  mapOutline,
  eyeOutline,
  calendarOutline,
  addCircleOutline,
  cameraOutline,
  closeCircleOutline,
  peopleOutline,
  pencilOutline,
  trashOutline,
});

interface VisitPhotoExisting {
  id: string;
  kind: 'existing';
  key: string;
  thumbKey?: string;
  notes: string;
}

interface VisitPhotoNew {
  id: string;
  kind: 'new';
  full: File;
  thumb: File;
  previewUrl: string;
  fullPreviewUrl: string;
  notes: string;
}

type VisitPhotoEntry = VisitPhotoExisting | VisitPhotoNew;

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    OsmMapComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonFooter,
    IonButton,
    IonIcon,
    IonChip,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonModal,
    IonInput,
    IonTextarea,
    IonToggle,
    IonRange,
    IonSelect,
    IonSelectOption,
    IonReorder,
    IonReorderGroup,
    PersonPickerComponent,
    PhotoLightboxComponent,
  ],
  templateUrl: './item-detail.page.html',
  styleUrl: './item-detail.page.scss',
})
export class ItemDetailPage implements OnInit, ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly itemsService = inject(ItemsService);
  private readonly mediaService = inject(MediaService);
  private readonly photoUrlService = inject(PhotoUrlService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertController = inject(AlertController);
  readonly i18n = inject(I18nService);

  readonly imageAccept = IMAGE_ACCEPT;
  readonly rejectedStatus = ItemStatus.Rejected;

  readonly history = signal<ItemHistory | null>(null);
  readonly loading = signal(true);
  readonly visitModalOpen = signal(false);
  readonly savingVisit = signal(false);
  readonly deletingVisit = signal(false);
  readonly editingExperienceId = signal<string | null>(null);
  readonly visitPhotoEntries = signal<VisitPhotoEntry[]>([]);
  readonly processingPhotos = signal(false);
  readonly photoSelectionError = signal<string | null>(null);
  readonly lightboxOpen = signal(false);
  readonly lightboxPhotos = signal<LightboxPhoto[]>([]);
  readonly lightboxIndex = signal(0);
  readonly companionPersonIds = signal<string[]>([]);
  readonly visitVisibility = signal(ExperienceVisibility.Shared);

  readonly visitVisibilities = Object.values(ExperienceVisibility);

  readonly visitForm = this.fb.nonNullable.group({
    visitedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    food: [8],
    service: [8],
    atmosphere: [8],
    valueForMoney: [8],
    overall: [8],
    notes: [''],
    wouldReturn: [true],
  });

  private itemId: string | null = null;

  ngOnInit() {
    this.itemId = this.route.snapshot.paramMap.get('id');
  }

  ionViewWillEnter() {
    this.loadHistory();
  }

  loadHistory() {
    const id = this.itemId ?? this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.itemId = id;
    this.loading.set(true);
    this.itemsService.history(id).subscribe({
      next: (h) => {
        this.history.set(h);
        this.loadPhotoUrls(h.experiences);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  edit() {
    const id = this.history()?.item.id;
    if (id) this.router.navigate(['/item', id, 'edit']);
  }

  isEditingVisit(): boolean {
    return this.editingExperienceId() != null;
  }

  openVisitModal() {
    this.editingExperienceId.set(null);
    this.companionPersonIds.set([]);
    this.visitVisibility.set(ExperienceVisibility.Shared);
    this.resetVisitForm();
    this.visitModalOpen.set(true);
  }

  openEditVisitModal(exp: Experience) {
    this.editingExperienceId.set(exp.id);
    this.revokeNewPhotoPreviews();

    this.visitPhotoEntries.set(
      (exp.photos ?? []).map((photo) => ({
        id: photo.key,
        kind: 'existing' as const,
        key: photo.key,
        thumbKey: photo.thumbKey,
        notes: photo.notes ?? '',
      })),
    );

    this.ensurePhotosLoaded(exp.photos ?? []);

    this.visitForm.reset({
      visitedAt: exp.visitedAt.slice(0, 10),
      food: exp.rating?.food ?? 8,
      service: exp.rating?.service ?? 8,
      atmosphere: exp.rating?.atmosphere ?? 8,
      valueForMoney: exp.rating?.valueForMoney ?? 8,
      overall: exp.rating?.overall ?? 8,
      notes: exp.notes ?? '',
      wouldReturn: exp.wouldReturn ?? true,
    });
    this.companionPersonIds.set(exp.companionPersonIds ?? []);
    this.visitVisibility.set(exp.visibility ?? ExperienceVisibility.Shared);

    this.visitModalOpen.set(true);
  }

  closeVisitModal() {
    this.revokeNewPhotoPreviews();
    this.visitPhotoEntries.set([]);
    this.editingExperienceId.set(null);
    this.photoSelectionError.set(null);
    this.visitModalOpen.set(false);
  }

  async onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    this.photoSelectionError.set(null);
    this.processingPhotos.set(true);

    const drafts: VisitPhotoNew[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!isImageFile(file)) continue;
        try {
          const { full, thumb } = await prepareImageFile(file);
          drafts.push({
            id: crypto.randomUUID(),
            kind: 'new',
            full,
            thumb,
            previewUrl: URL.createObjectURL(thumb),
            fullPreviewUrl: URL.createObjectURL(full),
            notes: '',
          });
        } catch (error) {
          if (error instanceof ImagePrepareError) {
            if (error.code === 'IMAGE_TOO_LARGE') {
              this.photoSelectionError.set(this.i18n.t('item.photoTooLarge'));
            } else {
              this.photoSelectionError.set(this.i18n.t('item.photoProcessingFailed'));
            }
          } else {
            this.photoSelectionError.set(this.i18n.t('item.photoProcessingFailed'));
          }
        }
      }

      if (drafts.length) {
        this.visitPhotoEntries.update((current) => [...current, ...drafts]);
      }
    } finally {
      this.processingPhotos.set(false);
      input.value = '';
    }
  }

  updatePhotoNotes(id: string, notes: string) {
    this.visitPhotoEntries.update((photos) =>
      photos.map((p) => (p.id === id ? { ...p, notes } : p)),
    );
  }

  removeVisitPhoto(id: string) {
    this.visitPhotoEntries.update((photos) => {
      const removed = photos.find((p) => p.id === id);
      if (removed?.kind === 'new') {
        URL.revokeObjectURL(removed.previewUrl);
        URL.revokeObjectURL(removed.fullPreviewUrl);
      }
      return photos.filter((p) => p.id !== id);
    });
  }

  onPhotoReorder(event: CustomEvent<ItemReorderEventDetail>) {
    const entries = [...this.visitPhotoEntries()];
    const [moved] = entries.splice(event.detail.from, 1);
    entries.splice(event.detail.to, 0, moved);
    this.visitPhotoEntries.set(entries);
    event.detail.complete(entries);
  }

  visitPhotoPreview(entry: VisitPhotoEntry): string | undefined {
    if (entry.kind === 'new') return entry.previewUrl;
    return this.photoDisplayUrl(entry);
  }

  openVisitPhotoPreview(index: number) {
    const photos = this.visitPhotoEntries().map((entry) => this.toLightboxPhoto(entry));
    this.openLightbox(photos, index);
  }

  async saveVisit() {
    const itemId = this.itemId;
    if (!itemId || this.visitForm.invalid) return;
    this.savingVisit.set(true);
    const v = this.visitForm.getRawValue();

    try {
      const photos: { key: string; thumbKey?: string; notes?: string }[] = [];
      for (const entry of this.visitPhotoEntries()) {
        if (entry.kind === 'existing') {
          photos.push({
            key: entry.key,
            thumbKey: entry.thumbKey,
            notes: entry.notes.trim() || undefined,
          });
        } else {
          const uploaded = await this.mediaService.uploadPhoto(entry.full, entry.thumb);
          photos.push({
            key: uploaded.key,
            thumbKey: uploaded.thumbKey,
            notes: entry.notes.trim() || undefined,
          });
        }
      }

      const payload: ExperiencePayload = {
        visitedAt: new Date(v.visitedAt).toISOString(),
        rating: {
          food: v.food,
          service: v.service,
          atmosphere: v.atmosphere,
          valueForMoney: v.valueForMoney,
          overall: v.overall,
        },
        notes: v.notes.trim() || undefined,
        wouldReturn: v.wouldReturn,
        companionPersonIds: this.companionPersonIds(),
        visibility: this.visitVisibility(),
        photos,
      };

      const editingId = this.editingExperienceId();
      const req = editingId
        ? this.itemsService.updateExperience(editingId, payload)
        : this.itemsService.addExperience(itemId, payload);

      req.subscribe({
        next: () => {
          this.savingVisit.set(false);
          this.closeVisitModal();
          this.loadHistory();
        },
        error: () => this.savingVisit.set(false),
      });
    } catch {
      this.savingVisit.set(false);
    }
  }

  photoDisplayUrl(photo: Pick<ExperiencePhoto, 'key' | 'thumbKey'>): string | undefined {
    return this.photoUrlService.url(photo.thumbKey ?? photo.key);
  }

  openExperiencePhotoViewer(photos: ExperiencePhoto[], index: number) {
    this.openLightbox(
      photos.map((photo) => ({
        key: photo.key,
        thumbKey: photo.thumbKey,
        notes: photo.notes,
      })),
      index,
    );
  }

  closeLightbox() {
    this.lightboxOpen.set(false);
  }

  companionsLabel(exp: Experience): string | null {
    if (!exp.companions?.length) return null;
    return exp.companions.join(', ');
  }

  canEditVisit(exp: Experience): boolean {
    return exp.canEdit ?? exp.authorId === this.auth.user()?.id;
  }

  async confirmDeleteVisit(exp: Experience) {
    if (!this.canEditVisit(exp)) return;

    const alert = await this.alertController.create({
      header: this.i18n.t('item.deleteVisitTitle'),
      message: this.i18n.t('item.deleteVisitConfirm'),
      buttons: [
        {
          text: this.i18n.t('common.cancel'),
          role: 'cancel',
        },
        {
          text: this.i18n.t('item.deleteVisit'),
          role: 'destructive',
          handler: () => {
            this.deleteVisit(exp);
          },
        },
      ],
    });

    await alert.present();
  }

  confirmDeleteVisitForEditing() {
    const experienceId = this.editingExperienceId();
    if (!experienceId) return;

    const experience = this.history()?.experiences.find(
      (entry) => entry.id === experienceId,
    );
    if (!experience) return;

    void this.confirmDeleteVisit(experience);
  }

  deleteVisit(exp: Experience) {
    if (!this.canEditVisit(exp) || this.deletingVisit()) return;

    this.deletingVisit.set(true);
    this.itemsService.deleteExperience(exp.id).subscribe({
      next: () => {
        this.deletingVisit.set(false);
        if (this.editingExperienceId() === exp.id) {
          this.closeVisitModal();
        }
        this.loadHistory();
      },
      error: () => this.deletingVisit.set(false),
    });
  }

  showsAuthor(exp: Experience): boolean {
    return !!exp.authorDisplayName && exp.authorId !== this.auth.user()?.id;
  }

  openGoogleMaps() {
    const loc = this.history()?.item.location;
    if (!loc) return;
    const url =
      loc.googleMapsUrl ??
      googleMapsUrl(
        loc.latitude,
        loc.longitude,
        loc.googlePlaceId ?? loc.placeId,
        this.history()?.item.name,
      );
    if (url) window.open(url, '_blank');
  }

  hasGoogleMaps(): boolean {
    const loc = this.history()?.item.location;
    if (!loc) return false;
    return !!(
      loc.googleMapsUrl ||
      loc.googlePlaceId ||
      loc.placeId ||
      (loc.latitude != null && loc.longitude != null)
    );
  }

  openOsm() {
    const loc = this.history()?.item.location;
    if (loc?.latitude != null && loc?.longitude != null) {
      window.open(openStreetMapUrl(loc.latitude, loc.longitude), '_blank');
    }
  }

  openStreetView() {
    const loc = this.history()?.item.location;
    if (loc?.latitude != null && loc?.longitude != null) {
      window.open(streetViewUrl(loc.latitude, loc.longitude), '_blank');
    }
  }

  showsLocation(): boolean {
    const category = this.history()?.item.category;
    return category != null && categoryHasLocation(category);
  }

  hasLocation(): boolean {
    const loc = this.history()?.item.location;
    return loc?.latitude != null && loc?.longitude != null;
  }

  mapLat(): number {
    return this.history()?.item.location?.latitude ?? 0;
  }

  mapLng(): number {
    return this.history()?.item.location?.longitude ?? 0;
  }

  wouldReturnLabel(value: boolean | undefined): string {
    if (value === true) return this.i18n.t('common.yes');
    if (value === false) return this.i18n.t('common.no');
    return this.i18n.t('common.dash');
  }

  private resetVisitForm() {
    this.revokeNewPhotoPreviews();
    this.visitPhotoEntries.set([]);
    this.visitForm.reset({
      visitedAt: new Date().toISOString().slice(0, 10),
      food: 8,
      service: 8,
      atmosphere: 8,
      valueForMoney: 8,
      overall: 8,
      notes: '',
      wouldReturn: true,
    });
    this.companionPersonIds.set([]);
    this.visitVisibility.set(ExperienceVisibility.Shared);
  }

  private loadPhotoUrls(experiences: Experience[]) {
    for (const exp of experiences) {
      this.ensurePhotosLoaded(exp.photos ?? []);
    }
  }

  private ensurePhotosLoaded(photos: ExperiencePhoto[]) {
    this.photoUrlService.ensureMany(
      photos.flatMap((photo) => [photo.thumbKey ?? photo.key, photo.key]),
    );
  }

  private openLightbox(photos: LightboxPhoto[], index: number) {
    this.lightboxPhotos.set(photos);
    this.lightboxIndex.set(index);
    this.lightboxOpen.set(true);
    this.photoUrlService.ensureMany(photos.map((photo) => photo.key));
  }

  private toLightboxPhoto(entry: VisitPhotoEntry): LightboxPhoto {
    if (entry.kind === 'new') {
      return {
        blobUrl: entry.previewUrl,
        fullBlobUrl: entry.fullPreviewUrl,
        notes: entry.notes,
      };
    }
    return {
      key: entry.key,
      thumbKey: entry.thumbKey,
      notes: entry.notes,
    };
  }

  private revokeNewPhotoPreviews() {
    for (const photo of this.visitPhotoEntries()) {
      if (photo.kind === 'new') {
        URL.revokeObjectURL(photo.previewUrl);
        URL.revokeObjectURL(photo.fullPreviewUrl);
      }
    }
  }
}
