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
  addressEn?: string;
  addressEs?: string;
  city?: string;
  cityEn?: string;
  cityEs?: string;
  region?: string;
  regionEn?: string;
  regionEs?: string;
  country?: string;
  countryEn?: string;
  countryEs?: string;
  latitude?: number;
  longitude?: number;
  /** @deprecated Use googlePlaceId */
  placeId?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
}

/** Google enrichment for place items (cover photo, rating, review tips). */
export interface PlaceDetails {
  /** Google Places rating on a 1–5 scale */
  googleRating?: number;
  googleUserRatingCount?: number;
  /** S3 object key for the cached cover photo */
  coverPhotoKey?: string;
  /** Signed S3 URL filled at read time */
  coverPhotoUrl?: string;
  tipsEn?: string;
  tipsEs?: string;
  /** ISO timestamp; once set, enrichment is not re-run */
  enrichedAt?: string;
}

/** Catalog metadata for wine items (often filled from Vivino). */
export interface WineDetails {
  vivinoWineId?: string;
  vivinoVintageId?: string;
  vivinoUrl?: string;
  winery?: string;
  grapes?: string[];
  grapesEn?: string[];
  grapesEs?: string[];
  region?: string;
  regionEn?: string;
  regionEs?: string;
  country?: string;
  countryEn?: string;
  countryEs?: string;
  style?: string;
  styleEn?: string;
  styleEs?: string;
  /** Alcohol by volume, e.g. 14.5 */
  alcoholPercentage?: number;
  allergens?: string[];
  allergensEn?: string[];
  allergensEs?: string[];
  /** @deprecated Prefer descriptionEn / descriptionEs */
  description?: string;
  descriptionEn?: string;
  descriptionEs?: string;
  price?: number;
  priceCurrency?: string;
  /** Vivino-style rating on a 1–5 scale */
  rating?: number;
  year?: string;
  /** Absolute URL for display (Vivino CDN or signed S3 URL at read time) */
  imageUrl?: string;
  /** S3 object key for the cached bottle image in our storage */
  imageKey?: string;
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
  /** Future: link to a registered Malviviendo user */
  linkedUserId?: string;
  sourceCount: number;
  visitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonRecommendationSummary {
  id: string;
  name: string;
  category: ItemCategory;
  status: ItemStatus;
}

export interface PersonVisitSummary {
  id: string;
  itemId: string;
  itemName: string;
  visitedAt: string;
  rating?: StructuredRating;
}

export interface PersonActivity {
  recommendations: PersonRecommendationSummary[];
  visits: PersonVisitSummary[];
}

export interface PersonSuggestResult {
  exact: Person | null;
  similar: Person[];
}

export interface CompanionNameResolution {
  query: string;
  personId?: string;
  createNew?: boolean;
}

export interface CompanionAmbiguity {
  query: string;
  candidates: { id: string; name: string; type: PersonType }[];
}

export interface ConversationMessageMetadata {
  relatedItems?: { id: string; name: string }[];
  placeCandidates?: {
    index: number;
    googlePlaceId: string;
    name: string;
    address: string;
    category: string;
  }[];
  wineCandidates?: {
    index: number;
    wineId: string;
    vintageId?: string;
    name: string;
    displayName: string;
    winery?: string;
    region?: string;
    year?: string;
    rating?: number;
    itemId?: string;
  }[];
  companionAmbiguities?: CompanionAmbiguity[];
  pendingVisit?: {
    type: 'log_visit' | 'create_place_and_log_visit' | 'update_visit';
    placeId?: string;
    googlePlaceId?: string;
    experienceId?: string;
    visitedAt?: string;
    overallRating?: number;
    notes?: string;
    wouldReturn?: boolean;
    companions: string[];
    photoKeys?: string[];
    photoThumbKeys?: string[];
  };
  suggestedReplies?: string[];
  error?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  photoKeys?: string[];
  metadata?: ConversationMessageMetadata;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface Conversation extends ConversationSummary {
  messages: ConversationMessage[];
}

export interface StructuredRating {
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
  /** Localized display names when the place/wine name differs by language */
  nameEn?: string;
  nameEs?: string;
  category: ItemCategory;
  status: ItemStatus;
  rejectionReason?: string;
  location?: Location;
  place?: PlaceDetails;
  wine?: WineDetails;
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

export interface ExperienceItemRef {
  id: string;
  name: string;
  category: ItemCategory;
}

export interface Experience {
  id: string;
  itemId: string;
  authorId: string;
  visibility: ExperienceVisibility;
  /** Malviviendo users who joined this visit — can view even on private experiences */
  participantUserIds: string[];
  visitedAt: string;
  rating?: StructuredRating;
  notes?: string;
  wouldReturn?: boolean;
  /** Resolved from companionPersonIds on read */
  companions?: string[];
  companionPersonIds?: string[];
  /** Wine items linked to this visit (e.g. bottles tried at a restaurant) */
  wineItemIds: string[];
  photos?: ExperiencePhoto[];
  createdAt: string;
  updatedAt: string;
  /** Populated on read */
  authorDisplayName?: string;
  canEdit?: boolean;
  /** Primary item (place or wine) this experience belongs to */
  place?: ExperienceItemRef;
  /** Linked wine items resolved for display */
  wines?: ExperienceItemRef[];
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
  wines?: ExperienceItemRef[];
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
