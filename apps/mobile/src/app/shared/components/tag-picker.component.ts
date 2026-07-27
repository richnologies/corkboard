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
import { FAVORITE_TAG, normalizeTag } from '@org/domain';
import { TagsService, TagCount } from '../../core/services/tags.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ addOutline, closeCircle });

@Component({
  selector: 'app-tag-picker',
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
  templateUrl: './tag-picker.component.html',
  styleUrl: './tag-picker.component.scss',
})
export class TagPickerComponent implements OnInit {
  private readonly tagsService = inject(TagsService);

  readonly tags = model<string[]>([]);
  readonly excludeTags = input<string[]>([FAVORITE_TAG]);

  readonly query = signal('');
  readonly library = signal<TagCount[]>([]);
  readonly loading = signal(true);

  readonly filteredSuggestions = computed(() => {
    const q = this.query().trim().toLowerCase();
    const selected = new Set(this.tags().map(normalizeTag));
    const excluded = new Set(this.excludeTags().map(normalizeTag));

    return this.library()
      .filter((entry) => !excluded.has(normalizeTag(entry.tag)))
      .filter((entry) => !selected.has(normalizeTag(entry.tag)))
      .filter((entry) => !q || entry.tag.toLowerCase().includes(q))
      .slice(0, 12);
  });

  readonly canCreateNew = computed(() => {
    const value = normalizeTag(this.query());
    if (!value || this.excludeTags().map(normalizeTag).includes(value)) {
      return false;
    }
    const selected = this.tags().some((tag) => normalizeTag(tag) === value);
    const inLibrary = this.library().some(
      (entry) => normalizeTag(entry.tag) === value,
    );
    return !selected && !inLibrary;
  });

  ngOnInit() {
    this.tagsService.list().subscribe({
      next: (tags) => {
        this.library.set(tags);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isSelected(tag: string): boolean {
    const normalized = normalizeTag(tag);
    return this.tags().some((t) => normalizeTag(t) === normalized);
  }

  toggleTag(tag: string) {
    if (this.isSelected(tag)) {
      this.removeTag(tag);
    } else {
      this.addTag(tag);
    }
  }

  addFromQuery(event?: Event) {
    event?.preventDefault();
    const value = normalizeTag(this.query());
    if (!value || this.excludeTags().map(normalizeTag).includes(value)) return;
    this.addTag(value);
    this.query.set('');
  }

  onQueryInput(ev: CustomEvent) {
    this.query.set((ev.detail as { value?: string }).value ?? '');
  }

  removeTag(tag: string) {
    const normalized = normalizeTag(tag);
    this.tags.update((current) =>
      current.filter((t) => normalizeTag(t) !== normalized),
    );
  }

  private addTag(tag: string) {
    const normalized = normalizeTag(tag);
    if (!normalized || this.isSelected(normalized)) return;
    this.tags.update((current) => [...current, normalized]);
  }
}
