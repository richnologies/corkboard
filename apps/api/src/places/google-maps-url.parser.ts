export interface ParsedGoogleMapsUrl {
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  name?: string;
  googleMapsUrl: string;
}

export function buildGoogleMapsUrl(opts: {
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  name?: string;
}): string {
  if (opts.googlePlaceId?.startsWith('ChIJ')) {
    const query = encodeURIComponent(opts.name ?? 'Place');
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${opts.googlePlaceId}`;
  }
  if (opts.latitude != null && opts.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${opts.latitude},${opts.longitude}`;
  }
  return '';
}

export function parseGoogleMapsUrl(url: string): ParsedGoogleMapsUrl | null {
  try {
    const parsed = new URL(url);
    const full = parsed.toString();

    let latitude: number | undefined;
    let longitude: number | undefined;
    let googlePlaceId: string | undefined;
    let name: string | undefined;

    const placeIdParam =
      parsed.searchParams.get('query_place_id') ??
      parsed.searchParams.get('place_id');
    if (placeIdParam?.startsWith('ChIJ')) {
      googlePlaceId = placeIdParam;
    }

    const q = parsed.searchParams.get('q');
    if (q?.startsWith('place_id:')) {
      const id = q.replace('place_id:', '');
      if (id.startsWith('ChIJ')) googlePlaceId = id;
    } else if (q && !q.includes('place_id')) {
      const coordMatch = q.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
      if (coordMatch) {
        latitude = parseFloat(coordMatch[1]);
        longitude = parseFloat(coordMatch[2]);
      }
    }

    const atMatch = full.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,|\?|\/|$)/);
    if (atMatch) {
      latitude = parseFloat(atMatch[1]);
      longitude = parseFloat(atMatch[2]);
    }

    const dMatch = full.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (dMatch) {
      latitude = parseFloat(dMatch[1]);
      longitude = parseFloat(dMatch[2]);
    }

    const chijMatch = full.match(/(ChIJ[\w-]+)/);
    if (chijMatch) {
      googlePlaceId = chijMatch[1];
    }

    const placePath = parsed.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placePath) {
      name = decodeURIComponent(placePath[1].replace(/\+/g, ' '));
    }

    if (!googlePlaceId && latitude == null && longitude == null) {
      return null;
    }

    const googleMapsUrl = buildGoogleMapsUrl({
      latitude,
      longitude,
      googlePlaceId,
      name,
    });

    return {
      latitude,
      longitude,
      googlePlaceId,
      name,
      googleMapsUrl: googleMapsUrl || full,
    };
  } catch {
    return null;
  }
}

export async function resolveGoogleMapsInput(input: string): Promise<ParsedGoogleMapsUrl | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      url = response.url;
    } catch {
      return null;
    }
  }

  return parseGoogleMapsUrl(url);
}
