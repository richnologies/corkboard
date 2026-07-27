export const FAVORITE_TAG = 'favorite';

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function hasFavoriteTag(tags: string[]): boolean {
  return tags.some((tag) => normalizeTag(tag) === FAVORITE_TAG);
}

export function addFavoriteTag(tags: string[]): string[] {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  if (!normalized.includes(FAVORITE_TAG)) {
    normalized.push(FAVORITE_TAG);
  }
  return normalized;
}

export function removeFavoriteTag(tags: string[]): string[] {
  return tags.map(normalizeTag).filter((tag) => tag && tag !== FAVORITE_TAG);
}

export function tagsWithoutFavorite(tags: string[]): string[] {
  return removeFavoriteTag(tags);
}
