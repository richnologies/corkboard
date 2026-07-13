import { ItemCategory } from '@org/domain';

export const categoryIcons: Record<ItemCategory, string> = {
  [ItemCategory.Restaurant]: 'restaurant-outline',
  [ItemCategory.Hotel]: 'bed-outline',
  [ItemCategory.Wine]: 'wine-outline',
  [ItemCategory.Bar]: 'beer-outline',
  [ItemCategory.Cafe]: 'cafe-outline',
  [ItemCategory.Other]: 'pin-outline',
};
