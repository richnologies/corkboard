/** Whole-star visit rating display helpers (1–5). */

export function clampVisitStars(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/** e.g. 4 → "★★★★☆" */
export function visitStarsText(value: number | null | undefined): string {
  const stars = clampVisitStars(value);
  if (stars == null) return '';
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

/** e.g. 4 → "4/5" */
export function visitStarsLabel(value: number | null | undefined): string {
  const stars = clampVisitStars(value);
  if (stars == null) return '';
  return `${stars}/5`;
}
