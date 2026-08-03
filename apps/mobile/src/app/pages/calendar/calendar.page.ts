import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular/common';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  chevronBackOutline,
  chevronForwardOutline,
  imagesOutline,
  locationOutline,
  peopleOutline,
} from 'ionicons/icons';
import { ExperienceCalendarEntry } from '@org/domain';
import { firstValueFrom } from 'rxjs';
import { ExperiencesService } from '../../core/services/experiences.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { visitStarsLabel, visitStarsText } from '../../shared/visit-stars';

addIcons({
  calendarOutline,
  chevronBackOutline,
  chevronForwardOutline,
  imagesOutline,
  locationOutline,
  peopleOutline,
});

interface CalendarCell {
  date: Date;
  inMonth: boolean;
  key: string;
  visitCount: number;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function visitLocalDateKey(visitedAt: string): string {
  const date = new Date(visitedAt);
  if (Number.isNaN(date.getTime())) return visitedAt.slice(0, 10);
  return toDateKey(date);
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    TranslatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonIcon,
    IonCard,
    IonCardContent,
  ],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPage implements OnInit, ViewWillEnter {
  private readonly experiencesService = inject(ExperiencesService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);

  readonly loading = signal(true);
  readonly entries = signal<ExperienceCalendarEntry[]>([]);
  readonly viewMonth = signal(this.startOfMonth(new Date()));
  readonly selectedDateKey = signal<string | null>(toDateKey(new Date()));

  readonly monthLabel = computed(() => {
    const month = this.viewMonth();
    return new Intl.DateTimeFormat(this.i18n.angularLocale(), {
      month: 'long',
      year: 'numeric',
    }).format(month);
  });

  readonly weekdayLabels = computed(() => {
    const locale = this.i18n.angularLocale();
    const start = this.weekStartsOn();
    const labels: string[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const day = (start + offset) % 7;
      const date = new Date(2024, 0, 7 + day);
      labels.push(
        new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date),
      );
    }
    return labels;
  });

  readonly visitsByDate = computed(() => {
    const map = new Map<string, ExperienceCalendarEntry[]>();
    for (const entry of this.entries()) {
      const key = visitLocalDateKey(entry.visitedAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  });

  readonly monthGrid = computed(() => {
    const month = this.viewMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const startPad = (first.getDay() - this.weekStartsOn() + 7) % 7;
    const start = new Date(year, monthIndex, 1 - startPad);
    const counts = new Map<string, number>();
    for (const [key, visits] of this.visitsByDate()) {
      counts.set(key, visits.length);
    }

    const cells: CalendarCell[] = [];
    for (let index = 0; index < 42; index++) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toDateKey(date);
      cells.push({
        date,
        inMonth: date.getMonth() === monthIndex,
        key,
        visitCount: counts.get(key) ?? 0,
      });
    }
    return cells;
  });

  readonly selectedVisits = computed(() => {
    const key = this.selectedDateKey();
    if (!key) return [];
    return this.visitsByDate().get(key) ?? [];
  });

  readonly selectedDateLabel = computed(() => {
    const key = this.selectedDateKey();
    if (!key) return '';
    const date = this.parseDateKey(key);
    return new Intl.DateTimeFormat(this.i18n.angularLocale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date);
  });

  ngOnInit() {
    void this.load();
  }

  ionViewWillEnter() {
    void this.load();
  }

  async load(event?: { target?: { complete: () => void } }) {
    this.loading.set(true);
    try {
      const grid = this.buildGridRange(this.viewMonth());
      const data = await firstValueFrom(
        this.experiencesService.calendar(grid.from, grid.to),
      );
      this.entries.set(data);
    } finally {
      this.loading.set(false);
      event?.target?.complete();
    }
  }

  prevMonth() {
    const current = this.viewMonth();
    this.viewMonth.set(
      new Date(current.getFullYear(), current.getMonth() - 1, 1),
    );
    void this.load();
  }

  nextMonth() {
    const current = this.viewMonth();
    this.viewMonth.set(
      new Date(current.getFullYear(), current.getMonth() + 1, 1),
    );
    void this.load();
  }

  selectDay(key: string) {
    this.selectedDateKey.set(key);
  }

  isSelected(key: string): boolean {
    return this.selectedDateKey() === key;
  }

  isToday(key: string): boolean {
    return key === toDateKey(new Date());
  }

  openPlace(itemId: string) {
    this.router.navigate(['/item', itemId]);
  }

  starsText(value: number | null | undefined): string {
    return visitStarsText(value);
  }

  starsLabel(value: number | null | undefined): string {
    return visitStarsLabel(value);
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private parseDateKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private weekStartsOn(): number {
    const locale = this.i18n.angularLocale();
    try {
      const info = (
        new Intl.Locale(locale) as Intl.Locale & {
          weekInfo?: { firstDay: number };
        }
      ).weekInfo;
      if (info?.firstDay != null) {
        return info.firstDay === 7 ? 0 : info.firstDay;
      }
    } catch {
      // Fall back to Monday.
    }
    return 1;
  }

  private buildGridRange(month: Date): { from: string; to: string } {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const startPad = (first.getDay() - this.weekStartsOn() + 7) % 7;
    const start = new Date(year, monthIndex, 1 - startPad);
    const end = new Date(start);
    end.setDate(start.getDate() + 41);
    return { from: toDateKey(start), to: toDateKey(end) };
  }
}
