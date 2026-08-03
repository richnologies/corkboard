import { Injectable, inject } from '@angular/core';
import { Observable, Subject, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Item, ItemHistory, Experience, ItemCategory, ItemStatus, SourceType, ExperienceVisibility } from '@org/domain';

export interface ItemFilters {
  status?: ItemStatus;
  category?: ItemCategory;
  excludeCategory?: ItemCategory;
  sourceType?: SourceType;
  referrerName?: string;
  tag?: string;
  q?: string;
}

export interface CreateItemPayload {
  name: string;
  nameEn?: string;
  nameEs?: string;
  category: ItemCategory;
  status?: ItemStatus;
  rejectionReason?: string;
  location?: {
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
    googlePlaceId?: string;
    googleMapsUrl?: string;
    placeId?: string;
  };
  wine?: {
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
    alcoholPercentage?: number;
    allergens?: string[];
    allergensEn?: string[];
    allergensEs?: string[];
    description?: string;
    descriptionEn?: string;
    descriptionEs?: string;
    price?: number;
    priceCurrency?: string;
    rating?: number;
    year?: string;
    imageUrl?: string;
    imageKey?: string;
  };
  links?: string[];
  tags?: string[];
  source?: {
    type: SourceType;
    referrerName?: string;
    referrerPersonId?: string;
    url?: string;
    notes?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly api = inject(ApiService);
  private readonly changedSubject = new Subject<void>();

  /** Emits after create/update/remove so list pages can refresh while cached by Ionic tabs. */
  readonly changed$: Observable<void> = this.changedSubject.asObservable();

  list(filters?: ItemFilters) {
    return this.api.get<Item[]>('/items', filters as Record<string, string>);
  }

  get(id: string) {
    return this.api.get<Item>(`/items/${id}`);
  }

  history(id: string) {
    return this.api.get<ItemHistory>(`/items/${id}/history`);
  }

  create(payload: CreateItemPayload) {
    return this.api.post<Item>('/items', payload).pipe(
      tap(() => this.changedSubject.next()),
    );
  }

  update(id: string, payload: Partial<CreateItemPayload>) {
    return this.api.patch<Item>(`/items/${id}`, payload).pipe(
      tap(() => this.changedSubject.next()),
    );
  }

  remove(id: string) {
    return this.api.delete(`/items/${id}`).pipe(
      tap(() => this.changedSubject.next()),
    );
  }

  addExperience(itemId: string, payload: ExperiencePayload) {
    return this.api.post<Experience>(`/items/${itemId}/experiences`, payload).pipe(
      tap(() => this.changedSubject.next()),
    );
  }

  updateExperience(experienceId: string, payload: Partial<ExperiencePayload>) {
    return this.api.patch<Experience>(`/experiences/${experienceId}`, payload).pipe(
      tap(() => this.changedSubject.next()),
    );
  }

  deleteExperience(experienceId: string) {
    return this.api.delete(`/experiences/${experienceId}`).pipe(
      tap(() => this.changedSubject.next()),
    );
  }

  listExperiences(itemId: string) {
    return this.api.get<Experience[]>(`/items/${itemId}/experiences`);
  }
}

export interface ExperiencePayload {
  visitedAt?: string;
  rating?: {
    overall?: number;
  };
  notes?: string;
  wouldReturn?: boolean;
  companions?: string[];
  companionPersonIds?: string[];
  wineItemIds?: string[];
  visibility?: ExperienceVisibility;
  participantUserIds?: string[];
  photos?: { key: string; thumbKey?: string; notes?: string }[];
}
