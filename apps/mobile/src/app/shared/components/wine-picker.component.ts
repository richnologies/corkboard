import { Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import {
  IonButton,
  IonChip,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, closeCircle } from 'ionicons/icons';
import { Item, ItemCategory, ItemStatus } from '@org/domain';
import { ItemsService } from '../../core/services/items.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ addOutline, closeCircle });

@Component({
  selector: 'app-wine-picker',
  standalone: true,
  imports: [
    TranslatePipe,
    IonLabel,
    IonItem,
    IonInput,
    IonChip,
    IonIcon,
    IonButton,
    IonSpinner,
  ],
  templateUrl: './wine-picker.component.html',
  styleUrl: './wine-picker.component.scss',
})
export class WinePickerComponent implements OnInit {
  private readonly itemsService = inject(ItemsService);

  readonly wineIds = model<string[]>([]);
  readonly labelKey = input('item.winesWithVisit');
  readonly emptyHintKey = input('item.winesEmptyHint');
  readonly libraryLabelKey = input('item.winesPickerLibrary');

  readonly query = signal('');
  readonly library = signal<Item[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);

  readonly winesById = computed(() => {
    const map = new Map<string, Item>();
    for (const wine of this.library()) {
      map.set(wine.id, wine);
    }
    return map;
  });

  readonly filteredSuggestions = computed(() => {
    const q = this.query().trim().toLowerCase();
    const selected = new Set(this.wineIds());

    return this.library()
      .filter((wine) => !selected.has(wine.id))
      .filter((wine) => {
        if (!q) return true;
        const haystack = [
          wine.name,
          wine.wine?.winery,
          wine.wine?.region,
          wine.wine?.year,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 16);
  });

  readonly exactMatch = computed(() => {
    const value = this.query().trim().toLowerCase();
    if (!value) return null;
    return (
      this.library().find((wine) => wine.name.toLowerCase() === value) ?? null
    );
  });

  readonly canCreateNew = computed(() => {
    const value = this.query().trim();
    if (!value) return false;
    if (this.exactMatch()) return false;
    const selectedNames = this.wineIds()
      .map((id) => this.winesById().get(id)?.name.toLowerCase())
      .filter(Boolean);
    return !selectedNames.includes(value.toLowerCase());
  });

  ngOnInit() {
    this.reloadLibrary();
  }

  reloadLibrary() {
    this.loading.set(true);
    this.itemsService.list({ category: ItemCategory.Wine }).subscribe({
      next: (wines) => {
        this.library.set(
          [...wines].sort((a, b) => a.name.localeCompare(b.name)),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  wineName(id: string): string {
    const wine = this.winesById().get(id);
    if (!wine) return id;
    return wine.wine?.winery
      ? `${wine.wine.winery} · ${wine.name}`
      : wine.name;
  }

  wineMeta(id: string): string | null {
    const wine = this.winesById().get(id);
    if (!wine) return null;
    const parts = [wine.wine?.region, wine.wine?.year].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }

  toggleWine(wine: Item) {
    if (this.isSelected(wine.id)) {
      this.removeWine(wine.id);
    } else {
      this.addWine(wine);
    }
  }

  addFromQuery(event?: Event) {
    event?.preventDefault();
    const name = this.query().trim();
    if (!name || this.creating()) return;

    const exact = this.exactMatch();
    if (exact) {
      this.addWine(exact);
      this.query.set('');
      return;
    }

    this.createWine(name);
  }

  onQueryInput(ev: CustomEvent) {
    this.query.set((ev.detail as { value?: string }).value ?? '');
  }

  removeWine(id: string, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    this.wineIds.update((current) => current.filter((wineId) => wineId !== id));
  }

  isSelected(id: string): boolean {
    return this.wineIds().includes(id);
  }

  private createWine(name: string) {
    this.creating.set(true);
    this.itemsService
      .create({
        name,
        category: ItemCategory.Wine,
        status: ItemStatus.Wishlist,
      })
      .subscribe({
        next: (wine) => {
          this.library.update((current) => {
            const exists = current.some((entry) => entry.id === wine.id);
            return exists
              ? current
              : [...current, wine].sort((a, b) => a.name.localeCompare(b.name));
          });
          this.addWine(wine);
          this.query.set('');
          this.creating.set(false);
        },
        error: () => this.creating.set(false),
      });
  }

  private addWine(wine: Item) {
    if (this.isSelected(wine.id)) return;
    this.wineIds.update((current) => [...current, wine.id]);
  }
}
