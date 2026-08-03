import { DatePipe, DecimalPipe } from '@angular/common';
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
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonModal,
  IonInput,
  IonTextarea,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonReorder,
  IonReorderGroup,
  IonFab,
  IonFabButton,
} from '@ionic/angular/standalone';
import type { ItemReorderEventDetail } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  createOutline,
  mapOutline,
  eyeOutline,
  calendarOutline,
  addCircleOutline,
  cameraOutline,
  cloudOfflineOutline,
  peopleOutline,
  pencilOutline,
  trashOutline,
  wineOutline,
} from 'ionicons/icons';
import { Experience, ExperiencePhoto, ExperienceVisibility, ItemHistory, ItemStatus, categoryHasLocation, isWineCategory } from '@org/domain';
import { AuthService } from '../../core/services/auth.service';
import { ExperiencePayload, ItemsService } from '../../core/services/items.service';
import { WinesService } from '../../core/services/wines.service';
import { MediaService } from '../../core/services/media.service';
import { PhotoUrlService } from '../../core/services/photo-url.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { googleMapsUrl, openStreetMapUrl, streetViewUrl } from '../../shared/maps';
import {
  itemDisplayName,
  locationLine,
  wineAllergens,
  wineDescription as localizedWineDescription,
  wineGrapes,
  wineRegion,
  wineRegionCountry,
  wineStyle,
} from '../../shared/localized';
import { OsmMapComponent } from '../../shared/components/osm-map.component';
import { PersonPickerComponent } from '../../shared/components/person-picker.component';
import { WinePickerComponent } from '../../shared/components/wine-picker.component';
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
import { VisitRatingFaceComponent } from '../../shared/components/visit-rating-face.component';
import { VISIT_FACE_OPTIONS, VisitFaceScore, clampVisitStars } from '../../shared/visit-stars';

addIcons({
  add,
  createOutline,
  mapOutline,
  eyeOutline,
  calendarOutline,
  addCircleOutline,
  cameraOutline,
  cloudOfflineOutline,
  peopleOutline,
  pencilOutline,
  trashOutline,
  wineOutline,
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
    DecimalPipe,
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
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonModal,
    IonInput,
    IonTextarea,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonReorder,
    IonReorderGroup,
    IonFab,
    IonFabButton,
    PersonPickerComponent,
    WinePickerComponent,
    PhotoLightboxComponent,
    VisitRatingFaceComponent,
  ],
  templateUrl: './item-detail.page.html',
  styleUrl: './item-detail.page.scss',
})
export class ItemDetailPage implements OnInit, ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly itemsService = inject(ItemsService);
  private readonly winesService = inject(WinesService);
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
  readonly loadError = signal(false);
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
  readonly wineItemIds = signal<string[]>([]);
  readonly visitVisibility = signal(ExperienceVisibility.Shared);
  readonly defaultHref = signal('/tabs/places');
  readonly deletingItem = signal(false);

  readonly visitVisibilities = Object.values(ExperienceVisibility);

  readonly visitForm = this.fb.nonNullable.group({
    visitedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    overall: [4, [Validators.required, Validators.min(1), Validators.max(5)]],
    notes: [''],
    wouldReturn: [true],
  });

  readonly faceOptions = VISIT_FACE_OPTIONS;
  readonly selectedFace = signal<VisitFaceScore>(4);

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
        this.loadError.set(false);
        this.defaultHref.set(
          isWineCategory(h.item.category) ? '/tabs/wines' : '/tabs/places',
        );
        this.loadPhotoUrls(h.experiences);
        this.loading.set(false);
        this.maybeEnrichWine(h.item.id, h.item.wine);
        this.maybeOpenLogVisitFromQuery();
      },
      error: () => {
        this.loading.set(false);
        if (!this.history()) {
          this.loadError.set(true);
        }
      },
    });
  }

  private maybeOpenLogVisitFromQuery() {
    if (this.route.snapshot.queryParamMap.get('logVisit') !== '1') return;
    this.openVisitModal();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { logVisit: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private maybeEnrichWine(
    itemId: string,
    wine?: {
      description?: string;
      descriptionEn?: string;
      descriptionEs?: string;
      region?: string;
      regionEn?: string;
      regionEs?: string;
      country?: string;
      countryEn?: string;
      countryEs?: string;
      style?: string;
      styleEn?: string;
      styleEs?: string;
      grapes?: string[];
      grapesEn?: string[];
      grapesEs?: string[];
      allergens?: string[];
      allergensEn?: string[];
      allergensEs?: string[];
      imageKey?: string;
      price?: number;
      vivinoVintageId?: string;
      vivinoWineId?: string;
    },
  ) {
    if (!wine) return;
    const needs =
      !wine.descriptionEs?.trim() ||
      !wine.descriptionEn?.trim() ||
      ((wine.region || wine.regionEn || wine.regionEs) &&
        (!wine.regionEn?.trim() || !wine.regionEs?.trim())) ||
      ((wine.country || wine.countryEn || wine.countryEs) &&
        (!wine.countryEn?.trim() || !wine.countryEs?.trim())) ||
      ((wine.style || wine.styleEn || wine.styleEs) &&
        (!wine.styleEn?.trim() || !wine.styleEs?.trim())) ||
      ((wine.grapes?.length || wine.grapesEn?.length || wine.grapesEs?.length) &&
        (!(wine.grapesEn?.length || wine.grapes?.length) ||
          !wine.grapesEs?.length)) ||
      ((wine.allergens?.length ||
        wine.allergensEn?.length ||
        wine.allergensEs?.length) &&
        (!(wine.allergensEn?.length || wine.allergens?.length) ||
          !wine.allergensEs?.length)) ||
      !wine.imageKey ||
      wine.price == null;
    if (!needs) return;

    this.winesService
      .details({
        itemId,
        vintageId: wine.vivinoVintageId,
        wineId: wine.vivinoWineId,
      })
      .subscribe({
        next: (lookup) => {
          const current = this.history();
          if (!current || current.item.id !== itemId) return;
          this.history.set({
            ...current,
            item: { ...current.item, wine: lookup.wine },
          });
        },
      });
  }

  isWineItem(): boolean {
    const category = this.history()?.item.category;
    return category ? isWineCategory(category) : false;
  }

  canDeleteItem(): boolean {
    const item = this.history()?.item;
    const userId = this.auth.user()?.id;
    return !!item && !!userId && item.ownerId === userId;
  }

  deleteItemLabelKey(): string {
    return this.isWineItem() ? 'item.deleteWine' : 'item.deletePlace';
  }

  historyTitleKey(): string {
    return this.isWineItem() ? 'item.yourTastings' : 'item.yourHistory';
  }

  visitsCountLabelKey(): string {
    return this.isWineItem() ? 'item.tastings' : 'item.visits';
  }

  returnQuestionKey(): string {
    return this.isWineItem() ? 'item.returnQuestionWine' : 'item.returnQuestion';
  }

  wouldReturnKey(): string {
    return this.isWineItem() ? 'item.wouldBuyAgain' : 'item.wouldReturn';
  }

  logVisitKey(): string {
    return this.isWineItem() ? 'item.logTasting' : 'item.logVisit';
  }

  visitModalTitleKey(): string {
    if (this.isEditingVisit()) {
      return this.isWineItem() ? 'item.editTastingTitle' : 'item.editVisitTitle';
    }
    return this.isWineItem() ? 'item.logTastingTitle' : 'item.logVisitTitle';
  }

  visitedWithKey(): string {
    return this.isWineItem() ? 'item.tastedWith' : 'item.visitedWith';
  }

  companionsEmptyHintKey(): string {
    return this.isWineItem() ? 'people.tastingEmptyHint' : 'people.visitEmptyHint';
  }

  visitVisibilityKey(): string {
    return this.isWineItem() ? 'item.tastingVisibility' : 'item.visitVisibility';
  }

  saveVisitKey(): string {
    if (this.isEditingVisit()) {
      return this.isWineItem() ? 'item.saveTastingChanges' : 'item.saveVisitChanges';
    }
    return this.isWineItem() ? 'item.saveTasting' : 'item.saveVisit';
  }

  emptyVisitsKey(): string {
    return this.isWineItem() ? 'item.noTastings' : 'item.noVisits';
  }

  deleteVisitLabelKey(): string {
    return this.isWineItem() ? 'item.deleteTasting' : 'item.deleteVisit';
  }

  deleteVisitTitleKey(): string {
    return this.isWineItem() ? 'item.deleteTastingTitle' : 'item.deleteVisitTitle';
  }

  deleteVisitConfirmKey(): string {
    return this.isWineItem() ? 'item.deleteTastingConfirm' : 'item.deleteVisitConfirm';
  }

  showsWinePicker(): boolean {
    const editingId = this.editingExperienceId();
    if (editingId) {
      const exp = this.history()?.experiences.find((e) => e.id === editingId);
      if (exp && exp.itemId !== this.itemId) return true;
    }
    return !this.isWineItem();
  }

  isLinkedVisit(exp: Experience): boolean {
    return !!this.itemId && exp.itemId !== this.itemId;
  }

  onVisitClick(exp: Experience) {
    if (!this.canEditVisit(exp)) return;
    this.openEditVisitModal(exp);
  }

  openWine(wineId: string, event?: Event) {
    event?.stopPropagation();
    this.router.navigate(['/item', wineId]);
  }

  openPlace(placeId: string, event?: Event) {
    event?.stopPropagation();
    this.router.navigate(['/item', placeId]);
  }

  edit() {
    const id = this.history()?.item.id;
    if (id) this.router.navigate(['/item', id, 'edit']);
  }

  async confirmDeleteItem() {
    const item = this.history()?.item;
    if (!item || !this.canDeleteItem() || this.deletingItem()) return;

    const alert = await this.alertController.create({
      header: this.i18n.t('item.deleteItemTitle', {
        name: itemDisplayName(item, this.i18n.locale()),
      }),
      message: this.i18n.t('item.deleteItemConfirm'),
      buttons: [
        {
          text: this.i18n.t('common.cancel'),
          role: 'cancel',
        },
        {
          text: this.i18n.t(this.deleteItemLabelKey()),
          role: 'destructive',
          handler: () => {
            this.deleteItem(item.id);
          },
        },
      ],
    });

    await alert.present();
  }

  private deleteItem(id: string) {
    this.deletingItem.set(true);
    this.itemsService.remove(id).subscribe({
      next: () => {
        this.deletingItem.set(false);
        this.router.navigateByUrl(this.defaultHref());
      },
      error: () => this.deletingItem.set(false),
    });
  }

  isEditingVisit(): boolean {
    return this.editingExperienceId() != null;
  }

  openVisitModal() {
    this.editingExperienceId.set(null);
    this.companionPersonIds.set([]);
    this.wineItemIds.set([]);
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

    const overall = clampVisitStars(exp.rating?.overall) ?? 4;
    this.selectedFace.set(overall);
    this.visitForm.reset({
      visitedAt: exp.visitedAt.slice(0, 10),
      overall,
      notes: exp.notes ?? '',
      wouldReturn: exp.wouldReturn ?? true,
    });
    this.companionPersonIds.set(exp.companionPersonIds ?? []);
    this.wineItemIds.set(exp.wineItemIds ?? []);
    this.visitVisibility.set(exp.visibility ?? ExperienceVisibility.Shared);
    this.visitModalOpen.set(true);
  }

  closeVisitModal() {
    this.revokeNewPhotoPreviews();
    this.visitPhotoEntries.set([]);
    this.editingExperienceId.set(null);
    this.wineItemIds.set([]);
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
          overall: v.overall,
        },
        notes: v.notes.trim() || undefined,
        wouldReturn: v.wouldReturn,
        companionPersonIds: this.companionPersonIds(),
        visibility: this.visitVisibility(),
        photos,
      };

      if (this.showsWinePicker()) {
        payload.wineItemIds = this.wineItemIds();
      }

      const editingId = this.editingExperienceId();
      // Linked visits are stored on the place — always update/create against primary itemId.
      const primaryItemId =
        editingId != null
          ? (this.history()?.experiences.find((e) => e.id === editingId)?.itemId ??
            itemId)
          : itemId;

      const req = editingId
        ? this.itemsService.updateExperience(editingId, payload)
        : this.itemsService.addExperience(primaryItemId, payload);

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

  openExperiencePhotoViewer(photos: ExperiencePhoto[], index: number, event?: Event) {
    event?.stopPropagation();
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
      header: this.i18n.t(this.deleteVisitTitleKey()),
      message: this.i18n.t(this.deleteVisitConfirmKey()),
      buttons: [
        {
          text: this.i18n.t('common.cancel'),
          role: 'cancel',
        },
        {
          text: this.i18n.t(this.deleteVisitLabelKey()),
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

  openVivino() {
    const url = this.history()?.item.wine?.vivinoUrl;
    if (url) window.open(url, '_blank');
  }

  displayName(): string {
    const item = this.history()?.item;
    if (!item) return '';
    return itemDisplayName(item, this.i18n.locale());
  }

  placeLocationLine(): string | null {
    return locationLine(this.history()?.item.location, this.i18n.locale()) ?? null;
  }

  wineRegionLine(): string | null {
    const wine = this.history()?.item.wine;
    if (!wine) return null;
    const region = wineRegion(wine, this.i18n.locale());
    const winery = wine.winery;
    if (!winery && !region) return null;
    if (winery && region) return `${winery} · ${region}`;
    return winery || region || null;
  }

  wineGrapesLine(wine: NonNullable<import('@org/domain').Item['wine']>): string | null {
    const grapes = wineGrapes(wine, this.i18n.locale());
    return grapes?.length ? grapes.join(', ') : null;
  }

  wineRegionCountryLine(
    wine: NonNullable<import('@org/domain').Item['wine']>,
  ): string | null {
    return wineRegionCountry(wine, this.i18n.locale()) ?? null;
  }

  wineStyleLine(
    wine: NonNullable<import('@org/domain').Item['wine']>,
  ): string | null {
    return wineStyle(wine, this.i18n.locale()) ?? null;
  }

  wineAllergensLine(
    wine: NonNullable<import('@org/domain').Item['wine']>,
  ): string | null {
    const allergens = wineAllergens(wine, this.i18n.locale());
    return allergens?.length ? allergens.join(', ') : null;
  }

  wineDescription(wine: {
    description?: string;
    descriptionEn?: string;
    descriptionEs?: string;
  }): string | null {
    return (
      localizedWineDescription(wine, this.i18n.locale())?.trim() || null
    );
  }

  googleRatingLine(): string | null {
    if (this.isWineItem()) return null;
    const place = this.history()?.item.place;
    const score = place?.googleRating;
    if (score == null) return null;
    const formatted = Number(score).toFixed(1);
    const count = place?.googleUserRatingCount;
    if (count != null && count > 0) {
      return this.i18n.t('item.googleRatingWithCount', {
        score: formatted,
        count: String(count),
      });
    }
    return this.i18n.t('item.googleRating', { score: formatted });
  }

  placeTips(): string | null {
    if (this.isWineItem()) return null;
    const place = this.history()?.item.place;
    if (!place) return null;
    const locale = this.i18n.locale();
    const tips =
      locale === 'es'
        ? place.tipsEs || place.tipsEn
        : place.tipsEn || place.tipsEs;
    return tips?.trim() || null;
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

  setVisitStars(stars: VisitFaceScore) {
    this.selectedFace.set(stars);
    this.visitForm.controls.overall.setValue(stars);
  }

  private resetVisitForm() {
    this.revokeNewPhotoPreviews();
    this.visitPhotoEntries.set([]);
    this.selectedFace.set(4);
    this.visitForm.reset({
      visitedAt: new Date().toISOString().slice(0, 10),
      overall: 4,
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
