import { WineDetails } from '@org/domain';

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
  /** Where this hit came from — local corkboard, shared cache, or live Vivino */
  source: 'local' | 'cache' | 'vivino';
  /** Present when source is local (existing Item id) */
  itemId?: string;
}

export interface WineLookupResult {
  name: string;
  wine: WineDetails;
}

const USER_AGENT =
  process.env.VIVINO_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0';

const ALGOLIA_APP_ID = process.env.VIVINO_ALGOLIA_APP_ID ?? '9TAKGWJUXL';
const ALGOLIA_API_KEY =
  process.env.VIVINO_ALGOLIA_API_KEY ?? '60c11b2f1068885161d95ca068d3a6ae';
const ALGOLIA_INDEX = process.env.VIVINO_ALGOLIA_INDEX ?? 'WINES_prod';

const ALLERGEN_LABELS: Record<string, string> = {
  contains_milk_allergens: 'milk',
  contains_egg_allergens: 'egg',
  contains_gluten_allergens: 'gluten',
  contains_crustacean_allergens: 'crustaceans',
  contains_fish_allergens: 'fish',
  contains_peanut_allergens: 'peanuts',
  contains_soybean_allergens: 'soybeans',
  contains_nut_allergens: 'nuts',
  contains_celery_allergens: 'celery',
  contains_mustard_allergens: 'mustard',
  contains_sesame_seed_allergens: 'sesame',
  contains_lupin_allergens: 'lupin',
  contains_mollusc_allergens: 'molluscs',
  contains_sulfites_allergens: 'sulfites',
};

type JsonRecord = Record<string, unknown>;

export function buildVivinoWineUrl(opts: {
  wineId: string | number;
  wineSeo?: string;
  winerySeo?: string;
}): string {
  const wineId = String(opts.wineId);
  if (opts.winerySeo && opts.wineSeo) {
    return `https://www.vivino.com/${opts.winerySeo}-${opts.wineSeo}/w/${wineId}`;
  }
  return `https://www.vivino.com/w/${wineId}`;
}

function absoluteImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  return undefined;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function countryName(region: JsonRecord | undefined): string | undefined {
  const country = region?.['country'];
  if (typeof country === 'string') return country.toUpperCase();
  const record = asRecord(country);
  return asString(record?.['name']) ?? asString(record?.['code'])?.toUpperCase();
}

function grapeNames(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const names = raw
    .map((entry) => {
      const record = asRecord(entry);
      return asString(record?.['name']);
    })
    .filter((name): name is string => !!name);
  return names.length ? [...new Set(names)] : undefined;
}

function allergensFromFacts(facts: JsonRecord | undefined): string[] | undefined {
  if (!facts) return undefined;
  const labels = Object.entries(ALLERGEN_LABELS)
    .filter(([key]) => facts[key] === true)
    .map(([, label]) => label);
  return labels.length ? labels : undefined;
}

function pickVintageId(vintages: unknown): {
  vintageId?: string;
  year?: string;
  rating?: number;
  ratingsCount?: number;
} {
  if (!Array.isArray(vintages) || !vintages.length) return {};

  const scored = vintages
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => !!entry)
    .map((entry) => {
      const stats = asRecord(entry['statistics']) ?? {};
      const year = asString(entry['year']);
      const rating = asNumber(stats['ratings_average']) ?? 0;
      const ratingsCount = asNumber(stats['ratings_count']) ?? 0;
      const numericYear = year && /^\d{4}$/.test(year) ? Number(year) : 0;
      return {
        vintageId: asString(entry['id']),
        year,
        rating: rating > 0 ? rating : undefined,
        ratingsCount: ratingsCount > 0 ? ratingsCount : undefined,
        score:
          (rating > 0 ? 1_000_000 : 0) +
          ratingsCount * 10 +
          numericYear,
      };
    })
    .filter((entry) => entry.vintageId)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return {};
  return {
    vintageId: best.vintageId,
    year: best.year === 'U.V.' ? undefined : best.year,
    rating: best.rating,
    ratingsCount: best.ratingsCount,
  };
}

export function mapAlgoliaHit(hit: JsonRecord): WineSearchResult | null {
  const wineId = asString(hit['id']);
  if (!wineId) return null;

  const winery = asRecord(hit['winery']);
  const region = asRecord(hit['region']);
  const stats = asRecord(hit['statistics']) ?? {};
  const image = asRecord(hit['image']);
  const variations = asRecord(image?.['variations']);
  const vintagePick = pickVintageId(hit['vintages']);

  const name = asString(hit['name']) ?? 'Wine';
  const wineryName = asString(winery?.['name']);
  const year = vintagePick.year;
  const displayName = [wineryName, name, year].filter(Boolean).join(' · ');

  const wineSeo = asString(hit['seo_name']);
  const winerySeo = asString(winery?.['seo_name']);

  return {
    wineId,
    vintageId: vintagePick.vintageId,
    name,
    displayName,
    winery: wineryName,
    region: asString(region?.['name']),
    country: countryName(region),
    year,
    rating:
      vintagePick.rating ??
      asNumber(stats['ratings_average']) ??
      undefined,
    ratingsCount:
      vintagePick.ratingsCount ??
      asNumber(stats['ratings_count']) ??
      undefined,
    imageUrl: absoluteImageUrl(
      asString(variations?.['label_medium']) ??
        asString(variations?.['medium']) ??
        asString(image?.['location']),
    ),
    vivinoUrl: buildVivinoWineUrl({ wineId, wineSeo, winerySeo }),
    source: 'vivino',
  };
}

export function mapVintageDetails(
  payload: JsonRecord,
  price?: { amount?: number; currency?: string },
): WineLookupResult | null {
  const vintage = asRecord(payload['vintage']) ?? payload;
  const wine = asRecord(vintage['wine']);
  if (!wine) return null;

  const wineId = asString(wine['id']);
  if (!wineId) return null;

  const winery = asRecord(wine['winery']);
  const region = asRecord(wine['region']);
  const style = asRecord(wine['style']);
  const facts = asRecord(vintage['wine_facts']);
  const stats =
    asRecord(vintage['statistics']) ?? asRecord(wine['statistics']) ?? {};
  const image = asRecord(vintage['image']) ?? asRecord(wine['image']);
  const variations = asRecord(image?.['variations']);

  const wineName = asString(wine['name']) ?? 'Wine';
  const wineryName = asString(winery?.['name']);
  const yearRaw = asString(vintage['year']);
  const year = yearRaw && yearRaw !== 'U.V.' ? yearRaw : undefined;
  const name = [wineryName, wineName, year].filter(Boolean).join(' ');

  const alcohol =
    asNumber(wine['alcohol']) ??
    asNumber(facts?.['alcohol']) ??
    undefined;

  const rating = asNumber(stats['ratings_average']);

  return {
    name,
    wine: {
      vivinoWineId: wineId,
      vivinoVintageId: asString(vintage['id']),
      vivinoUrl: buildVivinoWineUrl({
        wineId,
        wineSeo: asString(wine['seo_name']),
        winerySeo: asString(winery?.['seo_name']),
      }),
      winery: wineryName,
      grapes: grapeNames(wine['grapes']) ?? grapeNames(style?.['grapes']),
      region: asString(region?.['name']),
      country: countryName(region),
      style: asString(style?.['name']),
      alcoholPercentage: alcohol,
      allergens: allergensFromFacts(facts),
      description:
        asString(wine['description']) ||
        asString(vintage['description']) ||
        undefined,
      price: price?.amount,
      priceCurrency: price?.currency,
      rating: rating && rating > 0 ? rating : undefined,
      year,
      imageUrl: absoluteImageUrl(
        asString(variations?.['label_medium']) ??
          asString(variations?.['medium']) ??
          asString(image?.['location']),
      ),
    },
  };
}

export function parseVivinoUrl(input: string): {
  wineId?: string;
  vintageId?: string;
} | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (!/vivino\.com$/i.test(url.hostname) && !/\.vivino\.com$/i.test(url.hostname)) {
    return null;
  }

  const path = url.pathname;

  const wineMatch =
    path.match(/\/w\/(\d+)/i) ||
    path.match(/\/wines\/(\d+)/i);
  const vintageMatch =
    path.match(/\/vintage\/(\d+)/i) ||
    path.match(/[?&]vintage_id=(\d+)/i) ||
    url.search.match(/[?&]vintage_id=(\d+)/i);

  const wineId = wineMatch?.[1];
  const vintageId = vintageMatch?.[1];
  if (!wineId && !vintageId) return null;
  return { wineId, vintageId };
}

export async function vivinoFetchJson(
  url: string,
  init?: RequestInit,
): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(init?.headers ?? {}),
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Vivino request failed (${response.status})`);
  }

  return (await response.json()) as JsonRecord;
}

export async function searchVivinoAlgolia(
  query: string,
  limit = 10,
): Promise<WineSearchResult[]> {
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
  const body = {
    params: new URLSearchParams({
      query,
      hitsPerPage: String(Math.min(Math.max(limit, 1), 25)),
    }).toString(),
  };

  const data = await vivinoFetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-algolia-application-id': ALGOLIA_APP_ID,
      'x-algolia-api-key': ALGOLIA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const hits = Array.isArray(data['hits']) ? data['hits'] : [];
  return hits
    .map((hit) => mapAlgoliaHit(asRecord(hit) ?? {}))
    .filter((hit): hit is WineSearchResult => !!hit)
    .slice(0, limit);
}

export async function fetchVintageDetails(
  vintageId: string,
): Promise<WineLookupResult | null> {
  const data = await vivinoFetchJson(
    `https://www.vivino.com/api/vintages/${vintageId}`,
  );
  return mapVintageDetails(data);
}

export async function fetchBestVintageForWine(
  wineId: string,
): Promise<string | null> {
  const results = await searchVivinoAlgolia(wineId, 5);
  const exact = results.find((result) => result.wineId === wineId) ?? results[0];
  return exact?.vintageId ?? null;
}

export async function fetchPriceForVintage(
  vintageId: string,
  wineName: string,
): Promise<{ amount?: number; currency?: string } | undefined> {
  try {
    const params = new URLSearchParams({
      country_code: process.env.VIVINO_COUNTRY ?? 'us',
      currency_code: process.env.VIVINO_CURRENCY ?? 'USD',
      page: '1',
      order_by: 'ratings_average',
      order: 'desc',
      min_rating: '1',
      search_term: wineName,
    });
    const data = await vivinoFetchJson(
      `https://www.vivino.com/api/explore/explore?${params.toString()}`,
    );
    const explore = asRecord(data['explore_vintage']);
    const matches = Array.isArray(explore?.['matches']) ? explore?.['matches'] : [];
    for (const match of matches) {
      const record = asRecord(match);
      const vintage = asRecord(record?.['vintage']);
      if (asString(vintage?.['id']) !== vintageId) continue;
      const price = asRecord(record?.['price']);
      const amount = asNumber(price?.['amount']);
      const currency =
        asString(asRecord(price?.['currency'])?.['code']) ??
        asString(price?.['currency']);
      if (amount != null) return { amount, currency };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export { ALGOLIA_APP_ID, USER_AGENT };
