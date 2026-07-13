import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
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
} from '@ionic/angular/standalone';
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
} from 'ionicons/icons';
import { Experience, ItemHistory } from '@org/domain';
import { ExperiencePayload, ItemsService } from '../../core/services/items.service';
import { MediaService } from '../../core/services/media.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { googleMapsUrl, openStreetMapUrl, streetViewUrl } from '../../shared/maps';
import { OsmMapComponent } from '../../shared/components/osm-map.component';

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
});

interface VisitPhotoExisting {
  id: string;
  kind: 'existing';
  key: string;
  notes: string;
}

interface VisitPhotoNew {
  id: string;
  kind: 'new';
  file: File;
  previewUrl: string;
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
  ],
  templateUrl: './item-detail.page.html',
  styleUrl: './item-detail.page.scss',
})
export class ItemDetailPage implements OnInit, ViewWillEnter {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly itemsService = inject(ItemsService);
  private readonly mediaService = inject(MediaService);
  private readonly fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);

  readonly history = signal<ItemHistory | null>(null);
  readonly loading = signal(true);
  readonly visitModalOpen = signal(false);
  readonly savingVisit = signal(false);
  readonly editingExperienceId = signal<string | null>(null);
  readonly visitPhotoEntries = signal<VisitPhotoEntry[]>([]);
  readonly photoUrls = signal<Record<string, string>>({});

  readonly visitForm = this.fb.nonNullable.group({
    visitedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    food: [8],
    service: [8],
    atmosphere: [8],
    valueForMoney: [8],
    overall: [8],
    notes: [''],
    companions: [''],
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
        notes: photo.notes ?? '',
      })),
    );

    for (const photo of exp.photos ?? []) {
      this.ensurePhotoUrl(photo.key);
    }

    this.visitForm.reset({
      visitedAt: exp.visitedAt.slice(0, 10),
      food: exp.rating?.food ?? 8,
      service: exp.rating?.service ?? 8,
      atmosphere: exp.rating?.atmosphere ?? 8,
      valueForMoney: exp.rating?.valueForMoney ?? 8,
      overall: exp.rating?.overall ?? 8,
      notes: exp.notes ?? '',
      companions: exp.companions?.join(', ') ?? '',
      wouldReturn: exp.wouldReturn ?? true,
    });

    this.visitModalOpen.set(true);
  }

  closeVisitModal() {
    this.revokeNewPhotoPreviews();
    this.visitPhotoEntries.set([]);
    this.editingExperienceId.set(null);
    this.visitModalOpen.set(false);
  }

  onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;

    const drafts: VisitPhotoNew[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      drafts.push({
        id: crypto.randomUUID(),
        kind: 'new',
        file,
        previewUrl: URL.createObjectURL(file),
        notes: '',
      });
    }

    if (drafts.length) {
      this.visitPhotoEntries.update((current) => [...current, ...drafts]);
    }
    input.value = '';
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
      }
      return photos.filter((p) => p.id !== id);
    });
  }

  visitPhotoPreview(entry: VisitPhotoEntry): string | undefined {
    if (entry.kind === 'new') return entry.previewUrl;
    return this.photoUrls()[entry.key];
  }

  async saveVisit() {
    const itemId = this.itemId;
    if (!itemId || this.visitForm.invalid) return;
    this.savingVisit.set(true);
    const v = this.visitForm.getRawValue();

    try {
      const photos: { key: string; notes?: string }[] = [];
      for (const entry of this.visitPhotoEntries()) {
        if (entry.kind === 'existing') {
          photos.push({ key: entry.key, notes: entry.notes.trim() || undefined });
        } else {
          const key = await this.mediaService.uploadFile(entry.file);
          photos.push({ key, notes: entry.notes.trim() || undefined });
        }
      }

      const companions = v.companions
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

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
        companions,
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

  photoUrl(key: string): string | undefined {
    return this.photoUrls()[key];
  }

  companionsLabel(exp: Experience): string | null {
    if (!exp.companions?.length) return null;
    return exp.companions.join(', ');
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
      companions: '',
      wouldReturn: true,
    });
  }

  private loadPhotoUrls(experiences: Experience[]) {
    const keys = new Set<string>();
    for (const exp of experiences) {
      for (const photo of exp.photos ?? []) {
        keys.add(photo.key);
      }
    }

    for (const key of keys) {
      this.ensurePhotoUrl(key);
    }
  }

  private ensurePhotoUrl(key: string) {
    if (this.photoUrls()[key]) return;
    this.mediaService.getViewUrl(key).subscribe({
      next: ({ url }) => {
        this.photoUrls.update((current) => ({ ...current, [key]: url }));
      },
    });
  }

  private revokeNewPhotoPreviews() {
    for (const photo of this.visitPhotoEntries()) {
      if (photo.kind === 'new') {
        URL.revokeObjectURL(photo.previewUrl);
      }
    }
  }
}
