import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRange,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
  IonToggle,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, navigateOutline } from 'ionicons/icons';
import {
  RecommendationsService,
  Recommendation,
} from '../../core/services/recommendations.service';
import { TagsService } from '../../core/services/tags.service';
import { ItemCategory } from '@org/domain';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

addIcons({ sparklesOutline, navigateOutline });

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonChip,
    IonIcon,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonRange,
    TranslatePipe,
  ],
  templateUrl: './discover.page.html',
  styleUrl: './discover.page.scss',
})
export class DiscoverPage {
  private readonly recommendations = inject(RecommendationsService);
  private readonly tagsService = inject(TagsService);
  private readonly router = inject(Router);

  readonly results = signal<Recommendation[]>([]);
  readonly tags = signal<{ tag: string; count: number }[]>([]);
  readonly loading = signal(false);
  readonly useLocation = signal(false);
  readonly selectedTags = signal<string[]>([]);
  readonly radiusKm = signal(15);
  readonly romanticMode = signal(false);

  constructor() {
    this.tagsService.list().subscribe((t) => this.tags.set(t));
  }

  toggleTag(tag: string) {
    const current = this.selectedTags();
    this.selectedTags.set(
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  dateNight() {
    this.romanticMode.set(true);
    this.selectedTags.set(['romantic']);
    this.useLocation.set(true);
    this.suggest();
  }

  weekendGetaway() {
    this.romanticMode.set(false);
    this.selectedTags.set(['weekend', 'getaway']);
    this.useLocation.set(false);
    this.suggest(ItemCategory.Hotel);
  }

  suggest(category?: ItemCategory) {
    this.loading.set(true);
    const tags = [...this.selectedTags()];
    if (this.romanticMode() && !tags.includes('romantic')) tags.push('romantic');

    const run = (latitude?: number, longitude?: number) => {
      this.recommendations
        .suggest({
          latitude,
          longitude,
          radiusKm: this.radiusKm(),
          tags: tags.length ? tags.join(',') : undefined,
          minOverallRating: 7,
          excludeVisitedWithinDays: 30,
          category,
          limit: 10,
        })
        .subscribe({
          next: (res) => {
            this.results.set(res);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
    };

    if (this.useLocation() && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos: GeolocationPosition) => run(pos.coords.latitude, pos.coords.longitude),
        () => run(),
      );
    } else {
      run();
    }
  }

  openItem(id: string) {
    this.router.navigate(['/item', id]);
  }
}
