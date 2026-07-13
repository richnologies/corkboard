import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildGoogleMapsUrl,
  resolveGoogleMapsInput,
} from './google-maps-url.parser.js';

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

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly userAgent: string;

  constructor(config: ConfigService) {
    this.userAgent =
      config.get<string>('app.nominatimUserAgent') ??
      'Corkboard/1.0 (personal recommendations app)';
  }

  async search(query: string, limit = 5): Promise<PlaceSearchResult[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));

    const data = await this.nominatimGet<NominatimResult[]>(url);
    return (data ?? []).map((place) => this.toResult(place));
  }

  async reverse(latitude: number, longitude: number): Promise<PlaceSearchResult | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');

    const place = await this.nominatimGet<NominatimResult>(url);
    if (!place?.lat || !place.lon) return null;
    return this.toResult(place);
  }

  async nearby(
    latitude: number,
    longitude: number,
    limit = 8,
  ): Promise<PlaceSearchResult[]> {
    const queries = ['restaurant', 'cafe', 'bar', 'hotel', 'bakery'];
    const seen = new Set<string>();
    const results: PlaceSearchResult[] = [];

    const atPoint = await this.reverse(latitude, longitude);
    if (atPoint) {
      seen.add(this.coordKey(atPoint.latitude, atPoint.longitude));
      results.push(atPoint);
    }

    for (const q of queries) {
      if (results.length >= limit) break;
      const batch = await this.searchNear(q, latitude, longitude, 4);
      for (const place of batch) {
        const key = this.coordKey(place.latitude, place.longitude);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(place);
        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  async resolveGoogleUrl(input: string): Promise<PlaceSearchResult | null> {
    const parsed = await resolveGoogleMapsInput(input);
    if (!parsed) return null;

    let name = parsed.name;
    let displayName = parsed.name ?? 'Google Maps place';
    let city: string | undefined;
    let country: string | undefined;

    if (parsed.latitude != null && parsed.longitude != null) {
      const reverse = await this.reverse(parsed.latitude, parsed.longitude);
      if (reverse) {
        name = name ?? reverse.name;
        displayName = reverse.displayName;
        city = reverse.city;
        country = reverse.country;
      }
    }

    if (parsed.latitude == null || parsed.longitude == null) {
      if (!parsed.googlePlaceId) return null;
      return {
        name: name ?? 'Place',
        displayName: name ?? parsed.googleMapsUrl,
        latitude: 0,
        longitude: 0,
        googlePlaceId: parsed.googlePlaceId,
        googleMapsUrl: parsed.googleMapsUrl,
        osmUrl: '',
        streetViewUrl: '',
      };
    }

    return this.toResult(
      {
        place_id: 0,
        lat: String(parsed.latitude),
        lon: String(parsed.longitude),
        display_name: displayName,
        name: name ?? displayName.split(',')[0],
        address: { city, country },
      },
      parsed.googlePlaceId,
      parsed.googleMapsUrl,
    );
  }

  private async searchNear(
    query: string,
    latitude: number,
    longitude: number,
    limit: number,
  ): Promise<PlaceSearchResult[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));

    const data = await this.nominatimGet<NominatimResult[]>(url);
    return (data ?? []).map((place) => this.toResult(place));
  }

  private async nominatimGet<T>(url: URL): Promise<T | null> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      this.logger.warn(`Nominatim request failed: ${response.status} ${url.pathname}`);
      return null;
    }

    return (await response.json()) as T;
  }

  private coordKey(lat: number, lon: number): string {
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
  }

  private toResult(
    place: NominatimResult,
    googlePlaceId?: string,
    googleMapsUrl?: string,
  ): PlaceSearchResult {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    const city =
      place.address?.city ?? place.address?.town ?? place.address?.village;
    const name = place.name ?? place.display_name.split(',')[0];
    const mapsUrl =
      googleMapsUrl ??
      buildGoogleMapsUrl({
        latitude: lat,
        longitude: lon,
        googlePlaceId,
        name,
      });

    return {
      name,
      displayName: place.display_name,
      latitude: lat,
      longitude: lon,
      city,
      country: place.address?.country,
      googlePlaceId,
      googleMapsUrl: mapsUrl,
      osmUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
      streetViewUrl: `https://www.google.com/maps?layer=c&cbll=${lat},${lon}`,
    };
  }
}
