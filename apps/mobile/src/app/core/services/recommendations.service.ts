import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Item, ItemCategory } from '@org/domain';

export interface Recommendation {
  item: Item;
  score: number;
  distanceKm?: number;
  latestOverallRating?: number;
  matchReasons: string[];
}

export interface RecommendationQuery {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  tags?: string;
  minOverallRating?: number;
  excludeVisitedWithinDays?: number;
  category?: ItemCategory;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class RecommendationsService {
  private readonly api = inject(ApiService);

  suggest(query: RecommendationQuery) {
    return this.api.get<Recommendation[]>('/recommendations', query as Record<string, string | number>);
  }
}
