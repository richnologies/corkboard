import { booleanAttribute, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { clampVisitStars, visitStarsText } from '../visit-stars';

@Component({
  selector: 'app-visit-rating-face',
  standalone: true,
  template: `
    @if (score(); as level) {
      <span
        class="visit-rating-face"
        [class.visit-rating-face--compact]="compact()"
        [class.visit-rating-face--large]="large()"
        [class.visit-rating-face--face-only]="faceOnly()"
        [attr.data-level]="level"
        [attr.aria-label]="label()"
      >
        <span class="visit-rating-face__emoji" aria-hidden="true">{{ face() }}</span>
        @if (!faceOnly()) {
          <span class="visit-rating-face__label">{{ label() }}</span>
        }
      </span>
    }
  `,
})
export class VisitRatingFaceComponent {
  private readonly i18n = inject(I18nService);

  readonly value = input<number | null | undefined>(null);
  readonly compact = input(false, { transform: booleanAttribute });
  readonly large = input(false, { transform: booleanAttribute });
  /** Show only the emoji — for tight spaces like stats cards. */
  readonly faceOnly = input(false, { transform: booleanAttribute });

  readonly score = computed(() => clampVisitStars(this.value()));
  readonly face = computed(() => visitStarsText(this.score()));
  readonly label = computed(() => {
    const level = this.score();
    this.i18n.locale();
    if (level == null) return '';
    return this.i18n.t(`item.ratingFace${level}`);
  });
}
