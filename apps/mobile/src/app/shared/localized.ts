import {
  AppLocale,
  Item,
  Location,
  WineDetails,
  pickLocalized,
  pickLocalizedList,
} from '@org/domain';

export function itemDisplayName(
  item: Pick<Item, 'name' | 'nameEn' | 'nameEs'>,
  locale: AppLocale,
): string {
  return pickLocalized(locale, item.nameEn, item.nameEs, item.name) ?? item.name;
}

export function locationCity(
  location: Location | undefined,
  locale: AppLocale,
): string | undefined {
  if (!location) return undefined;
  return pickLocalized(locale, location.cityEn, location.cityEs, location.city);
}

export function locationCountry(
  location: Location | undefined,
  locale: AppLocale,
): string | undefined {
  if (!location) return undefined;
  return pickLocalized(
    locale,
    location.countryEn,
    location.countryEs,
    location.country,
  );
}

export function locationAddress(
  location: Location | undefined,
  locale: AppLocale,
): string | undefined {
  if (!location) return undefined;
  return pickLocalized(
    locale,
    location.addressEn,
    location.addressEs,
    location.address,
  );
}

export function locationLine(
  location: Location | undefined,
  locale: AppLocale,
): string | undefined {
  if (!location) return undefined;
  const address = locationAddress(location, locale);
  const city = locationCity(location, locale);
  const country = locationCountry(location, locale);
  const primary = address || city;
  if (!primary) return country;
  return country ? `${primary}, ${country}` : primary;
}

export function locationCityCountry(
  location: Location | undefined,
  locale: AppLocale,
): string | undefined {
  const city = locationCity(location, locale);
  const country = locationCountry(location, locale);
  if (!city && !country) return undefined;
  if (city && country) return `${city}, ${country}`;
  return city || country;
}

export function wineGrapes(
  wine: WineDetails,
  locale: AppLocale,
): string[] | undefined {
  return pickLocalizedList(locale, wine.grapesEn, wine.grapesEs, wine.grapes);
}

export function wineRegion(
  wine: WineDetails,
  locale: AppLocale,
): string | undefined {
  return pickLocalized(locale, wine.regionEn, wine.regionEs, wine.region);
}

export function wineCountry(
  wine: WineDetails,
  locale: AppLocale,
): string | undefined {
  return pickLocalized(locale, wine.countryEn, wine.countryEs, wine.country);
}

export function wineStyle(
  wine: WineDetails,
  locale: AppLocale,
): string | undefined {
  return pickLocalized(locale, wine.styleEn, wine.styleEs, wine.style);
}

export function wineAllergens(
  wine: WineDetails,
  locale: AppLocale,
): string[] | undefined {
  return pickLocalizedList(
    locale,
    wine.allergensEn,
    wine.allergensEs,
    wine.allergens,
  );
}

export function wineDescription(
  wine: WineDetails,
  locale: AppLocale,
): string | undefined {
  return pickLocalized(
    locale,
    wine.descriptionEn,
    wine.descriptionEs,
    wine.description,
  );
}

export function wineRegionCountry(
  wine: WineDetails,
  locale: AppLocale,
): string | undefined {
  const region = wineRegion(wine, locale);
  const country = wineCountry(wine, locale);
  if (!region && !country) return undefined;
  if (region && country) return `${region}, ${country}`;
  return region || country;
}
