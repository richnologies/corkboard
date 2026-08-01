import type { Location } from './interfaces.js';
import { personNameSimilarity } from './people.js';
import type { AppLocale } from './i18n-fields.js';
import { pickLocalized } from './i18n-fields.js';

/** Lowercase + accent folding for location text matching. */
export function foldLocationText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const LOCATION_SIMILARITY_THRESHOLD = 0.6;

function locationSearchFields(location: Location | undefined): string[] {
  if (!location) return [];
  return [
    location.city,
    location.cityEn,
    location.cityEs,
    location.region,
    location.regionEn,
    location.regionEs,
    location.country,
    location.countryEn,
    location.countryEs,
    location.address,
    location.addressEn,
    location.addressEs,
  ].filter(Boolean) as string[];
}

/** Whether a saved location matches a city/country/area query. */
export function locationMatchesQuery(
  location: Location | undefined,
  query: string,
): boolean {
  const foldedQuery = foldLocationText(query);
  if (!foldedQuery) return true;

  const fields = locationSearchFields(location);
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

export function formatLocationSummary(
  location?: Location,
  locale: AppLocale = 'en',
): string | undefined {
  if (!location) return undefined;
  const parts = [
    pickLocalized(locale, location.cityEn, location.cityEs, location.city),
    pickLocalized(locale, location.regionEn, location.regionEs, location.region),
    pickLocalized(
      locale,
      location.countryEn,
      location.countryEs,
      location.country,
    ),
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(', ');
  return pickLocalized(
    locale,
    location.addressEn,
    location.addressEs,
    location.address,
  );
}
