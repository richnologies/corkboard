import type { Location } from './interfaces.js';
import { personNameSimilarity } from './people.js';

/** Lowercase + accent folding for location text matching. */
export function foldLocationText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const LOCATION_SIMILARITY_THRESHOLD = 0.6;

/** Whether a saved location matches a city/country/area query. */
export function locationMatchesQuery(
  location: Location | undefined,
  query: string,
): boolean {
  const foldedQuery = foldLocationText(query);
  if (!foldedQuery) return true;

  const fields = [
    location?.city,
    location?.region,
    location?.country,
    location?.address,
  ].filter(Boolean) as string[];

  if (!fields.length) return false;

  return fields.some((field) => {
    const foldedField = foldLocationText(field);
    if (
      foldedField.includes(foldedQuery) ||
      foldedQuery.includes(foldedField)
    ) {
      return true;
    }
    if (foldedQuery.length >= 4 && foldedField.length >= 4) {
      if (foldedQuery.slice(0, 4) === foldedField.slice(0, 4)) return true;
    }
    return personNameSimilarity(query, field) >= LOCATION_SIMILARITY_THRESHOLD;
  });
}

export function formatLocationSummary(location?: Location): string | undefined {
  if (!location) return undefined;
  const parts = [location.city, location.region, location.country].filter(
    Boolean,
  ) as string[];
  return parts.length ? parts.join(', ') : location.address;
}
