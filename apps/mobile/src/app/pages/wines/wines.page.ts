import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
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
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, addCircleOutline, calendarOutline, heart, trashOutline, wineOutline } from 'ionicons/icons';
import { ItemsService } from '../../core/services/items.service';
import { TagsService } from '../../core/services/tags.service';
import { AuthService } from '../../core/services/auth.service';
import { Item, ItemCategory, ItemStatus, FAVORITE_TAG, hasFavoriteTag } from '@org/domain';
import { categoryIcons } from '../../shared/labels';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { itemDisplayName, wineRegion } from '../../shared/localized';
import { visitStarsLabel, visitStarsText } from '../../shared/visit-stars';

addIcons({ add, addCircleOutline, calendarOutline, heart, trashOutline, wineOutline });

@Component({
  selector: 'app-wines',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonChip,
    IonFab,
    IonFabButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonButton,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    TranslatePipe,
  ],
  templateUrl: './wines.page.html',
  styleUrl: './wines.page.scss',
})
export class WinesPage implements ViewWillEnter {
  private readonly itemsService = inject(ItemsService);
  private readonly tagsService = inject(TagsService);
  private readonly auth = inject(AuthService);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly i18n = inject(I18nService);

  readonly items = signal<Item[]>([]);
  readonly tags = signal<{ tag: string; count: number }[]>([]);
  readonly loading = signal(true);
  readonly activeStatus = signal<ItemStatus | undefined>(undefined);
  readonly activeTag = signal<string | undefined>(undefined);
  readonly search = signal('');

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
  }

  load(options?: { target?: HTMLIonRefresherElement; silent?: boolean }) {
    if (!options?.silent && !options?.target) {
      this.loading.set(true);
    }
    const filters: Record<string, string> = {
      category: ItemCategory.Wine,
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
        this.loading.set(false);
        options?.target?.complete();
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
          text: this.i18n.t('item.deleteWine'),
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
    this.router.navigate(['/item/new'], {
      queryParams: { category: ItemCategory.Wine },
    });
  }

  isFavorite(item: Item): boolean {
    return hasFavoriteTag(item.tags);
  }

  displayName(item: Item): string {
    return itemDisplayName(item, this.i18n.locale());
  }

  wineMetaLine(item: Item): string | null {
    const wine = item.wine;
    if (!wine) return null;
    const region = wineRegion(wine, this.i18n.locale());
    const winery = wine.winery;
    if (!winery && !region) return null;
    if (winery && region) return `${winery} · ${region}`;
    return winery || region || null;
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
