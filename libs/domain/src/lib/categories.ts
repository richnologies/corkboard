import { ItemCategory } from './enums.js';

export function categoryHasLocation(category: ItemCategory): boolean {
  return category !== ItemCategory.Wine;
}

export function isWineCategory(category: ItemCategory): boolean {
  return category === ItemCategory.Wine;
}

/** Geo venues (restaurants, bars, etc.) — excludes wine. */
export function isPlaceCategory(category: ItemCategory): boolean {
  return category !== ItemCategory.Wine;
}

export const PLACE_CATEGORIES: ItemCategory[] = Object.values(ItemCategory).filter(
  (category) => category !== ItemCategory.Wine,
);
