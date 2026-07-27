import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Item, ItemHistory, Experience, ItemCategory, ItemStatus, SourceType, ExperienceVisibility } from '@org/domain';

export interface ItemFilters {
  status?: ItemStatus;
  category?: ItemCategory;
  sourceType?: SourceType;
  referrerName?: string;
  tag?: string;
  q?: string;
}

export interface CreateItemPayload {
  name: string;
  category: ItemCategory;
  status?: ItemStatus;
  rejectionReason?: string;
  location?: {
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
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
    return this.api.post<Item>('/items', payload);
  }

  update(id: string, payload: Partial<CreateItemPayload>) {
    return this.api.patch<Item>(`/items/${id}`, payload);
  }

  remove(id: string) {
    return this.api.delete(`/items/${id}`);
  }

  addExperience(itemId: string, payload: ExperiencePayload) {
    return this.api.post<Experience>(`/items/${itemId}/experiences`, payload);
  }

  updateExperience(experienceId: string, payload: Partial<ExperiencePayload>) {
    return this.api.patch<Experience>(`/experiences/${experienceId}`, payload);
  }

  deleteExperience(experienceId: string) {
    return this.api.delete(`/experiences/${experienceId}`);
  }

  listExperiences(itemId: string) {
    return this.api.get<Experience[]>(`/items/${itemId}/experiences`);
  }
}

export interface ExperiencePayload {
  visitedAt?: string;
  rating?: {
    food?: number;
    service?: number;
    atmosphere?: number;
    valueForMoney?: number;
    overall?: number;
  };
  notes?: string;
  wouldReturn?: boolean;
  companions?: string[];
  companionPersonIds?: string[];
  visibility?: ExperienceVisibility;
  participantUserIds?: string[];
  photos?: { key: string; thumbKey?: string; notes?: string }[];
}
