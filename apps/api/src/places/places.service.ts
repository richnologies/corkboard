import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ItemCategory } from '@org/domain';
import {
  buildGoogleMapsUrl,
  resolveGoogleMapsInput,
} from './google-maps-url.parser.js';
import {
  GooglePlaceRecord,
  googlePlaceResourceName,
  inferCategoryFromTypes,
  mapGooglePlace,
} from './google-places.js';

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
  category?: ItemCategory;
  source?: 'google' | 'openstreetmap';
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
  private readonly googleMapsApiKey?: string;

  constructor(config: ConfigService) {
    this.userAgent =
      config.get<string>('app.nominatimUserAgent') ??
      'Malviviendo/1.0 (personal recommendations app)';
    this.googleMapsApiKey = config.get<string>('app.google.mapsApiKey');
  }

  async searchMapPlaces(query: string, limit = 5): Promise<PlaceSearchResult[]> {
    if (this.googleMapsApiKey) {
      try {
        const googleResults = await this.searchGooglePlaces(query, limit);
        if (googleResults.length) return googleResults;
      } catch (error) {
        this.logger.warn(
          `Google Maps search failed, falling back to OpenStreetMap: ${error}`,
        );
      }
    }

    return (await this.search(query, limit)).map((place) => ({
      ...place,
      source: 'openstreetmap' as const,
      category: ItemCategory.Other,
    }));
  }

  async searchGooglePlaces(query: string, limit = 5): Promise<PlaceSearchResult[]> {
    if (!this.googleMapsApiKey) {
      throw new ServiceUnavailableException(
        'Google Maps is not configured. Set GOOGLE_MAPS_API_KEY.',
      );
    }

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.googleMapsApiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.googleMapsUri,places.addressComponents',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: Math.min(limit, 10),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Google Maps search failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as { places?: unknown[] };
    return (data.places ?? [])
      .map((place) => mapGooglePlace(place as Parameters<typeof mapGooglePlace>[0]))
      .filter((place): place is GooglePlaceRecord => !!place)
      .map((place) => this.googleRecordToResult(place));
  }

  async getGooglePlaceDetails(
    googlePlaceId: string,
  ): Promise<GooglePlaceRecord | null> {
    if (!this.googleMapsApiKey) {
      throw new ServiceUnavailableException(
        'Google Maps is not configured. Set GOOGLE_MAPS_API_KEY.',
      );
    }

    const resourceName = googlePlaceResourceName(googlePlaceId);
    const response = await fetch(
      `https://places.googleapis.com/v1/${resourceName}`,
      {
        headers: {
          'X-Goog-Api-Key': this.googleMapsApiKey,
          'X-Goog-FieldMask':
            'id,displayName,formattedAddress,location,types,googleMapsUri,addressComponents,rating,userRatingCount,reviews,photos',
        },
      },
    );

    if (!response.ok) {
      this.logger.warn(
        `Google place details failed (${response.status}) for ${resourceName}`,
      );
      return null;
    }

    const place = (await response.json()) as Parameters<typeof mapGooglePlace>[0];
    return mapGooglePlace(place);
  }

  /**
   * Download a Google Places photo via the Places Media API.
   * `photoName` is the resource name from Place Details, e.g. places/.../photos/...
   */
  async fetchPlacePhoto(
    photoName: string,
    maxHeightPx = 800,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.googleMapsApiKey) {
      throw new ServiceUnavailableException(
        'Google Maps is not configured. Set GOOGLE_MAPS_API_KEY.',
      );
    }

    const name = photoName.startsWith('places/')
      ? photoName
      : `places/${photoName}`;
    const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
    url.searchParams.set('maxHeightPx', String(Math.min(maxHeightPx, 1600)));
    url.searchParams.set('skipHttpRedirect', 'true');

    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': this.googleMapsApiKey,
      },
    });

    if (!response.ok) {
      this.logger.warn(
        `Google place photo failed (${response.status}) for ${name}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      photoUri?: string;
      name?: string;
    };
    if (!data.photoUri) {
      this.logger.warn(`Google place photo missing photoUri for ${name}`);
      return null;
    }

    const imageResponse = await fetch(data.photoUri, {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' },
    });
    if (!imageResponse.ok) {
      this.logger.warn(
        `Google place photo download failed (${imageResponse.status})`,
      );
      return null;
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (!buffer.length) return null;

    const contentType =
      imageResponse.headers.get('content-type')?.split(';')[0]?.trim() ||
      'image/jpeg';
    return { buffer, contentType };
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
      category: inferCategoryFromTypes(),
      source: googlePlaceId ? 'google' : 'openstreetmap',
    };
  }

  private googleRecordToResult(place: GooglePlaceRecord): PlaceSearchResult {
    const { latitude, longitude } = place;
    return {
      name: place.name,
      displayName: place.displayName,
      latitude,
      longitude,
      city: place.city,
      country: place.country,
      googlePlaceId: place.googlePlaceId,
      googleMapsUrl: place.googleMapsUrl,
      osmUrl: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`,
      streetViewUrl: `https://www.google.com/maps?layer=c&cbll=${latitude},${longitude}`,
      category: place.category,
      source: 'google',
    };
  }
}
