import { ItemCategory } from './enums.js';

export function categoryHasLocation(category: ItemCategory): boolean {
  return category !== ItemCategory.Wine;
}
