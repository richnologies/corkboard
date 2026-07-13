import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, locationOutline, restaurantOutline } from 'ionicons/icons';
import { ItemsService } from '../../core/services/items.service';
import { TagsService } from '../../core/services/tags.service';
import { Item, ItemStatus } from '@org/domain';
import { categoryIcons } from '../../shared/labels';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ add, locationOutline, restaurantOutline });

@Component({
  selector: 'app-places',
  standalone: true,
  imports: [
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
    IonCard,
    IonCardContent,
    IonButton,
    TranslatePipe,
  ],
  templateUrl: './places.page.html',
  styleUrl: './places.page.scss',
})
export class PlacesPage implements OnInit {
  private readonly itemsService = inject(ItemsService);
  private readonly tagsService = inject(TagsService);
  private readonly router = inject(Router);

  readonly items = signal<Item[]>([]);
  readonly tags = signal<{ tag: string; count: number }[]>([]);
  readonly loading = signal(true);
  readonly activeStatus = signal<ItemStatus | undefined>(undefined);
  readonly activeTag = signal<string | undefined>(undefined);
  readonly search = signal('');

  readonly categoryIcons = categoryIcons;
  readonly statuses = Object.values(ItemStatus);

  ngOnInit() {
    this.load();
    this.tagsService.list().subscribe((tags) => this.tags.set(tags));
  }

  load(event?: { target: HTMLIonRefresherElement }) {
    this.loading.set(!event);
    const filters: Record<string, string> = {};
    const status = this.activeStatus();
    const tag = this.activeTag();
    const city = this.search();
    if (status) filters['status'] = status;
    if (tag) filters['tag'] = tag;
    if (city) filters['city'] = city;

    this.itemsService.list(filters).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
        event?.target.complete();
      },
      error: () => {
        this.loading.set(false);
        event?.target.complete();
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

  addItem() {
    this.router.navigate(['/item/new']);
  }
}
