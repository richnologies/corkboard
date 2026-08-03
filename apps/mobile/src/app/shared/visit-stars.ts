/** Whole-face visit rating display helpers (1–5). */

/** 1 disgust → 5 delight; faces chosen to read clearly at a glance. */
export const VISIT_FACES = ['🤢', '😠', '😐', '😊', '🤩'] as const;

export type VisitFaceScore = 1 | 2 | 3 | 4 | 5;

export const VISIT_FACE_OPTIONS = VISIT_FACES.map((emoji, index) => ({
  value: (index + 1) as VisitFaceScore,
  emoji,
}));

export function clampVisitStars(value: number | null | undefined): VisitFaceScore | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(1, Math.min(5, Math.round(Number(value)))) as VisitFaceScore;
}

/** e.g. 4 → "😊" */
export function visitStarsText(value: number | null | undefined): string {
  const score = clampVisitStars(value);
  if (score == null) return '';
  return VISIT_FACES[score - 1];
}

/** e.g. 4 → "4/5" */
export function visitStarsLabel(value: number | null | undefined): string {
  const score = clampVisitStars(value);
  if (score == null) return '';
  return `${score}/5`;
}
