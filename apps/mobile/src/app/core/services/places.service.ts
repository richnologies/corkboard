import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface PlaceSearchResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  googlePlaceId?: string;
  googleMapsUrl: string;
  osmUrl: string;
  streetViewUrl: string;
}

@Injectable({ providedIn: 'root' })
export class PlacesService {
  private readonly api = inject(ApiService);

  search(query: string) {
    return this.api.get<PlaceSearchResult[]>('/places/search', { q: query });
  }

  reverse(lat: number, lon: number) {
    return this.api.get<PlaceSearchResult | null>('/places/reverse', { lat, lon });
  }

  nearby(lat: number, lon: number, limit = 8) {
    return this.api.get<PlaceSearchResult[]>('/places/nearby', { lat, lon, limit });
  }

  resolveGoogleUrl(url: string) {
    return this.api.post<PlaceSearchResult | null>('/places/resolve-google-url', { url });
  }
}
