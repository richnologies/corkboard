import {
  ExperienceVisibility,
  ItemCategory,
  ItemStatus,
  PersonType,
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
  /** @deprecated Prefer referrerPersonId — kept for search/display */
  referrerName?: string;
  referrerPersonId?: string;
  url?: string;
  notes?: string;
}

export interface Person {
  id: string;
  ownerId: string;
  name: string;
  type: PersonType;
  /** Future: link to a registered Corkboard user */
  linkedUserId?: string;
  sourceCount: number;
  visitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StructuredRating {
  food?: number;
  service?: number;
  atmosphere?: number;
  valueForMoney?: number;
  overall?: number;
}

export interface LatestVisitSummary {
  visitedAt: string;
  rating?: StructuredRating;
  notes?: string;
}

export interface Item {
  id: string;
  ownerId: string;
  name: string;
  category: ItemCategory;
  status: ItemStatus;
  rejectionReason?: string;
  location?: Location;
  links: string[];
  photoKeys: string[];
  tags: string[];
  source?: ItemSource;
  latestVisit?: LatestVisitSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ExperiencePhoto {
  key: string;
  thumbKey?: string;
  notes?: string;
  aiDescription?: string;
}

export interface Experience {
  id: string;
  itemId: string;
  authorId: string;
  visibility: ExperienceVisibility;
  /** Corkboard users who joined this visit — can view even on private experiences */
  participantUserIds: string[];
  visitedAt: string;
  rating?: StructuredRating;
  notes?: string;
  wouldReturn?: boolean;
  /** Resolved from companionPersonIds on read */
  companions?: string[];
  companionPersonIds?: string[];
  photos?: ExperiencePhoto[];
  createdAt: string;
  updatedAt: string;
  /** Populated on read */
  authorDisplayName?: string;
  canEdit?: boolean;
}

/** Visit row for the calendar view (place name denormalized for display). */
export interface ExperienceCalendarEntry {
  id: string;
  itemId: string;
  itemName: string;
  visitedAt: string;
  rating?: StructuredRating;
  notes?: string;
  companions?: string[];
  authorDisplayName?: string;
  photoCount: number;
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
