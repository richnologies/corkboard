import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import { AlertController } from '@ionic/angular/standalone';
import {
  IonButton,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  calendarOutline,
  closeOutline,
  heart,
  listOutline,
  locationOutline,
  mapOutline,
  restaurantOutline,
  trashOutline,
} from 'ionicons/icons';
import { ItemsService } from '../../core/services/items.service';
import { TagsService } from '../../core/services/tags.service';
import { AuthService } from '../../core/services/auth.service';
import { Item, ItemCategory, ItemStatus, FAVORITE_TAG, hasFavoriteTag } from '@org/domain';
import { categoryIcons } from '../../shared/labels';
import { hasMapLocation } from '../../shared/maps';
import { PlacesMapComponent } from '../../shared/components/places-map.component';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import {
  itemDisplayName,
  locationCityCountry,
  locationLine,
} from '../../shared/localized';
import { visitStarsLabel, visitStarsText } from '../../shared/visit-stars';

addIcons({
  add,
  addCircleOutline,
  calendarOutline,
  closeOutline,
  heart,
  listOutline,
  locationOutline,
  mapOutline,
  restaurantOutline,
  trashOutline,
});

type PlacesViewMode = 'list' | 'map';

const VIEW_MODE_STORAGE_KEY = 'corkboard.places.viewMode';

function readStoredViewMode(): PlacesViewMode {
  try {
    return sessionStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'map' ? 'map' : 'list';
  } catch {
    return 'list';
  }
}

function storeViewMode(mode: PlacesViewMode) {
  try {
    sessionStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

@Component({
  selector: 'app-places',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonChip,
    IonFab,
    IonFabButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonButton,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    TranslatePipe,
    PlacesMapComponent,
  ],
  templateUrl: './places.page.html',
  styleUrl: './places.page.scss',
})
export class PlacesPage implements ViewWillEnter {
  private readonly itemsService = inject(ItemsService);
  private readonly tagsService = inject(TagsService);
  private readonly auth = inject(AuthService);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly i18n = inject(I18nService);

  @ViewChild(PlacesMapComponent) private placesMap?: PlacesMapComponent;

  readonly items = signal<Item[]>([]);
  readonly tags = signal<{ tag: string; count: number }[]>([]);
  readonly loading = signal(true);
  readonly activeStatus = signal<ItemStatus | undefined>(undefined);
  readonly activeTag = signal<string | undefined>(undefined);
  readonly search = signal('');
  readonly viewMode = signal<PlacesViewMode>(readStoredViewMode());
  readonly previewItem = signal<Item | null>(null);

  readonly mappableItems = computed(() => this.items().filter(hasMapLocation));
  readonly hiddenMapCount = computed(
    () => this.items().length - this.mappableItems().length,
  );

  readonly categoryIcons = categoryIcons;
  readonly statuses = Object.values(ItemStatus);
  readonly favoriteTag = FAVORITE_TAG;

  constructor() {
    this.itemsService.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load({ silent: true }));
  }

  ionViewWillEnter() {
    this.load({ silent: this.items().length > 0 });
    this.tagsService.list().subscribe((tags) => this.tags.set(tags));
    if (this.viewMode() === 'map') {
      setTimeout(() => this.placesMap?.refreshSize(), 150);
    }
  }

  load(options?: { target?: HTMLIonRefresherElement; silent?: boolean }) {
    if (!options?.silent && !options?.target) {
      this.loading.set(true);
    }
    const filters: Record<string, string> = {
      excludeCategory: ItemCategory.Wine,
    };
    const status = this.activeStatus();
    const tag = this.activeTag();
    const q = this.search().trim();
    if (status) filters['status'] = status;
    if (tag) filters['tag'] = tag;
    if (q) filters['q'] = q;

    this.itemsService.list(filters).subscribe({
      next: (items) => {
        this.items.set(items);
        const previewId = this.previewItem()?.id;
        if (previewId && !items.some((item) => item.id === previewId)) {
          this.previewItem.set(null);
        }
        this.loading.set(false);
        options?.target?.complete();
        if (this.viewMode() === 'map') {
          setTimeout(() => this.placesMap?.refreshSize(), 150);
        }
      },
      error: () => {
        this.loading.set(false);
        options?.target?.complete();
      },
    });
  }

  setStatus(status: ItemStatus | undefined) {
    this.activeStatus.set(this.activeStatus() === status ? undefined : status);
    this.load();
  }

  setTag(tag: string | undefined) {
    this.activeTag.set(this.activeTag() === tag ? undefined : tag);
    this.load();
  }

  onSearch(ev: CustomEvent) {
    this.search.set((ev.detail as { value?: string }).value ?? '');
    this.load();
  }

  setViewMode(mode: PlacesViewMode) {
    this.viewMode.set(mode);
    storeViewMode(mode);
    if (mode === 'list') {
      this.previewItem.set(null);
    } else {
      setTimeout(() => this.placesMap?.refreshSize(), 150);
    }
  }

  onViewModeChange(ev: CustomEvent) {
    const value = (ev.detail as { value?: string }).value;
    if (value === 'list' || value === 'map') {
      this.setViewMode(value);
    }
  }

  onPinClicked(item: Item) {
    this.previewItem.set(item);
  }

  closePreview() {
    this.previewItem.set(null);
  }

  viewPreviewDetails() {
    const item = this.previewItem();
    if (item) {
      this.openItem(item.id);
    }
  }

  openItem(id: string) {
    this.router.navigate(['/item', id]);
  }

  logVisit(item: Item) {
    this.router.navigate(['/item', item.id], { queryParams: { logVisit: '1' } });
  }

  canDeleteItem(item: Item): boolean {
    const userId = this.auth.user()?.id;
    return !!userId && item.ownerId === userId;
  }

  async confirmDeleteItem(item: Item) {
    if (!this.canDeleteItem(item)) return;
    const alert = await this.alertCtrl.create({
      header: this.i18n.t('item.deleteItemTitle', {
        name: itemDisplayName(item, this.i18n.locale()),
      }),
      message: this.i18n.t('item.deleteItemConfirm'),
      buttons: [
        { text: this.i18n.t('common.cancel'), role: 'cancel' },
        {
          text: this.i18n.t('item.deletePlace'),
          role: 'destructive',
          handler: () => {
            this.itemsService.remove(item.id).subscribe({
              next: () => this.load({ silent: true }),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  addItem() {
    this.router.navigate(['/item/new']);
  }

  isFavorite(item: Item): boolean {
    return hasFavoriteTag(item.tags);
  }

  displayName(item: Item): string {
    return itemDisplayName(item, this.i18n.locale());
  }

  placeLocationLine(item: Item): string | null {
    return locationLine(item.location, this.i18n.locale()) ?? null;
  }

  placeCityCountry(item: Item): string | null {
    return locationCityCountry(item.location, this.i18n.locale()) ?? null;
  }

  displayTags(item: Item): string[] {
    return item.tags.filter((tag) => tag !== this.favoriteTag).slice(0, 4);
  }

  latestVisitScore(item: Item): number | null {
    const score = item.latestVisit?.rating?.overall;
    return score != null ? score : null;
  }

  starsText(value: number | null | undefined): string {
    return visitStarsText(value);
  }

  starsLabel(value: number | null | undefined): string {
    return visitStarsLabel(value);
  }

  latestVisitNotes(item: Item): string | null {
    const notes = item.latestVisit?.notes?.trim();
    return notes || null;
  }

  hasLatestVisit(item: Item): boolean {
    return !!item.latestVisit;
  }
}
