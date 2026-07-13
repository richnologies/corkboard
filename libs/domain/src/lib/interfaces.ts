import {
  ItemCategory,
  ItemStatus,
  SharePermission,
  SourceType,
} from './enums.js';

export interface Location {
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  /** @deprecated Use googlePlaceId */
  placeId?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
}

export interface ItemSource {
  type: SourceType;
  /** e.g. "John" when recommended by a friend */
  referrerName?: string;
  url?: string;
  notes?: string;
}

export interface StructuredRating {
  food?: number;
  service?: number;
  atmosphere?: number;
  valueForMoney?: number;
  overall?: number;
}

export interface Item {
  id: string;
  ownerId: string;
  name: string;
  category: ItemCategory;
  status: ItemStatus;
  location?: Location;
  links: string[];
  photoKeys: string[];
  tags: string[];
  source?: ItemSource;
  createdAt: string;
  updatedAt: string;
}

export interface ExperiencePhoto {
  key: string;
  notes?: string;
}

export interface Experience {
  id: string;
  itemId: string;
  userId: string;
  visitedAt: string;
  rating?: StructuredRating;
  notes?: string;
  wouldReturn?: boolean;
  companions?: string[];
  photos?: ExperiencePhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemShare {
  id: string;
  itemId: string;
  ownerId: string;
  sharedWithUserId: string;
  permission: SharePermission;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface ItemHistory {
  item: Item;
  experiences: Experience[];
  visitCount: number;
  latestExperience?: Experience;
  wouldReturn?: boolean;
}
