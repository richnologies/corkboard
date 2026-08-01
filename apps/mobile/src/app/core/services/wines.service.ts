import { Injectable, inject } from '@angular/core';
import { WineDetails } from '@org/domain';
import { ApiService } from './api.service';

export interface WineSearchResult {
  wineId: string;
  vintageId?: string;
  name: string;
  displayName: string;
  winery?: string;
  region?: string;
  country?: string;
  year?: string;
  rating?: number;
  ratingsCount?: number;
  imageUrl?: string;
  vivinoUrl: string;
  source: 'local' | 'cache' | 'vivino';
  itemId?: string;
}

export interface WineLookupResult {
  name: string;
  wine: WineDetails;
}

export interface WineIdentifyResult {
  extracted: {
    name?: string;
    winery?: string;
    year?: string;
    region?: string;
    grapes?: string[];
    alcoholPercentage?: number;
    searchQuery: string;
  };
  results: WineSearchResult[];
}

@Injectable({ providedIn: 'root' })
export class WinesService {
  private readonly api = inject(ApiService);

  search(query: string, limit = 10) {
    return this.api.get<WineSearchResult[]>('/wines/search', {
      q: query,
      limit: String(limit),
    });
  }

  details(opts: { vintageId?: string; wineId?: string; itemId?: string }) {
    const params: Record<string, string> = {};
    if (opts.vintageId) params['vintageId'] = opts.vintageId;
    if (opts.wineId) params['wineId'] = opts.wineId;
    if (opts.itemId) params['itemId'] = opts.itemId;
    return this.api.get<WineLookupResult>('/wines/details', params);
  }

  resolveVivinoUrl(url: string) {
    return this.api.post<WineLookupResult | null>('/wines/resolve-vivino-url', {
      url,
    });
  }

  identifyPhoto(photoKey: string) {
    return this.api.post<WineIdentifyResult>('/wines/identify-photo', {
      photoKey,
    });
  }
}
