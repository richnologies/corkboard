import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemCategory, Item, WineDetails } from '@org/domain';
import { CatalogService } from '../catalog/catalog.service.js';
import { ItemsService } from '../items/items.service.js';
import { OpenAiService } from '../openai/openai.service.js';
import { S3Service } from '../storage/s3.service.js';
import {
  WineDetailsCache,
  WineDetailsCacheDocument,
  WineSearchCache,
  WineSearchCacheDocument,
} from './wine-cache.schema.js';
import {
  WineLookupResult,
  WineSearchResult,
  buildVivinoWineUrl,
  fetchPriceForVintage,
  fetchVintageDetails,
  mapAlgoliaHit,
  parseVivinoUrl,
  searchVivinoAlgolia,
  vivinoFetchJson,
} from './vivino.js';

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const DETAILS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

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

@Injectable()
export class WinesService {
  private readonly logger = new Logger(WinesService.name);

  constructor(
    private readonly itemsService: ItemsService,
    private readonly catalogService: CatalogService,
    private readonly openai: OpenAiService,
    private readonly s3Service: S3Service,
    @InjectModel(WineSearchCache.name)
    private readonly searchCacheModel: Model<WineSearchCacheDocument>,
    @InjectModel(WineDetailsCache.name)
    private readonly detailsCacheModel: Model<WineDetailsCacheDocument>,
  ) {}

  async search(
    userId: string,
    query: string,
    limit = 10,
  ): Promise<WineSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) {
      throw new BadRequestException('Query must be at least 2 characters');
    }

    const local = await this.searchLocal(userId, q, limit);
    if (local.length >= limit) {
      return local.slice(0, limit);
    }

    const remaining = limit - local.length;
    const remote = await this.searchRemote(q, remaining);
    return this.mergeResults(local, remote, limit);
  }

  async details(
    userId: string,
    opts: {
      vintageId?: string;
      wineId?: string;
      itemId?: string;
    },
  ): Promise<WineLookupResult> {
    if (opts.itemId) {
      const fromItem = await this.lookupFromLocalItem(userId, opts.itemId);
      if (fromItem) {
        const enriched = await this.ensureEnrichedDetails(fromItem);
        if (enriched && this.needsEnrichment(fromItem.wine)) {
          try {
            await this.itemsService.update(userId, opts.itemId, {
              wine: enriched.wine,
            });
          } catch (error) {
            this.logger.warn(
              `Could not persist enriched wine on item ${opts.itemId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          }
        }
        return this.withResolvedImage(enriched ?? fromItem);
      }
    }

    if (opts.vintageId) {
      const owned = await this.itemsService.findOwnedByVivinoVintageId(
        userId,
        opts.vintageId,
      );
      if (owned?.wine) {
        const base = { name: owned.name, wine: owned.wine };
        const enriched = await this.ensureEnrichedDetails(base);
        if (enriched && this.needsEnrichment(owned.wine)) {
          try {
            await this.itemsService.update(userId, owned.id, {
              wine: enriched.wine,
            });
          } catch {
            // non-fatal
          }
        }
        return this.withResolvedImage(enriched ?? base);
      }

      const cached = await this.getCachedDetails(opts.vintageId);
      if (cached && !this.needsEnrichment(cached.wine)) {
        return this.withResolvedImage(cached);
      }
      if (cached) {
        const enriched = await this.ensureEnrichedDetails(cached);
        return this.withResolvedImage(enriched ?? cached);
      }
    }

    if (opts.wineId) {
      const owned = await this.itemsService.findOwnedByVivinoWineId(
        userId,
        opts.wineId,
      );
      if (owned?.wine) {
        const base = { name: owned.name, wine: owned.wine };
        const enriched = await this.ensureEnrichedDetails(base);
        if (enriched && this.needsEnrichment(owned.wine)) {
          try {
            await this.itemsService.update(userId, owned.id, {
              wine: enriched.wine,
            });
          } catch {
            // non-fatal
          }
        }
        return this.withResolvedImage(enriched ?? base);
      }
    }

    const vintageId =
      opts.vintageId?.trim() ||
      (opts.wineId
        ? await this.resolveVintageIdForWine(opts.wineId.trim())
        : undefined);

    if (!vintageId) {
      throw new BadRequestException('vintageId, wineId, or itemId is required');
    }

    try {
      const details = await fetchVintageDetails(vintageId);
      if (!details) {
        throw new NotFoundException('Wine not found on Vivino');
      }

      const price = await fetchPriceForVintage(
        vintageId,
        details.wine.winery
          ? `${details.wine.winery} ${details.name}`
          : details.name,
      );
      if (price?.amount != null) {
        details.wine.price = price.amount;
        details.wine.priceCurrency = price.currency;
      }

      const enriched = await this.ensureEnrichedDetails(details);
      return this.withResolvedImage(enriched ?? details);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.warn(
        `Vivino details failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new BadRequestException('Could not load wine details from Vivino');
    }
  }

  /**
   * Resolve signed image URLs for wine items returned from the items API.
   */
  async resolveItemWineImages(items: Item[]): Promise<Item[]> {
    return Promise.all(
      items.map(async (item) => {
        if (!item.wine?.imageKey) return item;
        const wine = await this.resolveWineImage(item.wine);
        return { ...item, wine };
      }),
    );
  }

  async resolveItemWineImage(item: Item): Promise<Item> {
    if (!item.wine?.imageKey) return item;
    return { ...item, wine: await this.resolveWineImage(item.wine) };
  }

  async resolveVivinoUrl(
    userId: string,
    url: string,
  ): Promise<WineLookupResult | null> {
    const parsed = parseVivinoUrl(url);
    if (!parsed) {
      return null;
    }

    try {
      return await this.details(userId, {
        vintageId: parsed.vintageId,
        wineId: parsed.wineId,
      });
    } catch (error) {
      this.logger.warn(
        `Vivino URL resolve failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async identifyFromPhoto(
    userId: string,
    photoKey: string,
  ): Promise<WineIdentifyResult> {
    try {
      this.s3Service.assertUserKey(userId, photoKey);
    } catch {
      throw new BadRequestException('Invalid photo key');
    }

    const imageUrl = await this.s3Service.createViewUrl(photoKey);
    const extracted = await this.openai.readWineBottleLabel(imageUrl);
    if (!extracted.searchQuery || extracted.searchQuery.length < 2) {
      throw new BadRequestException(
        'Could not read a wine name from that photo',
      );
    }

    const results = await this.search(userId, extracted.searchQuery, 10);
    return { extracted, results };
  }

  private async searchLocal(
    userId: string,
    query: string,
    limit: number,
  ): Promise<WineSearchResult[]> {
    const items = await this.itemsService.findAll(userId, {
      category: ItemCategory.Wine,
      q: query,
    });
    return items.slice(0, limit).map((item) => this.mapLocalItem(item));
  }

  private needsEnrichment(wine?: WineDetails): boolean {
    if (!wine) return true;
    if (!wine.imageKey || wine.price == null) return true;
    if (!wine.descriptionEn?.trim() || !wine.descriptionEs?.trim()) return true;
    if (
      (wine.region || wine.regionEn || wine.regionEs) &&
      (!wine.regionEn?.trim() || !wine.regionEs?.trim())
    ) {
      return true;
    }
    if (
      (wine.country || wine.countryEn || wine.countryEs) &&
      (!wine.countryEn?.trim() || !wine.countryEs?.trim())
    ) {
      return true;
    }
    if (
      (wine.style || wine.styleEn || wine.styleEs) &&
      (!wine.styleEn?.trim() || !wine.styleEs?.trim())
    ) {
      return true;
    }
    if (
      (wine.grapes?.length || wine.grapesEn?.length || wine.grapesEs?.length) &&
      (!(wine.grapesEn?.length || wine.grapes?.length) || !wine.grapesEs?.length)
    ) {
      return true;
    }
    if (
      (wine.allergens?.length ||
        wine.allergensEn?.length ||
        wine.allergensEs?.length) &&
      (!(wine.allergensEn?.length || wine.allergens?.length) ||
        !wine.allergensEs?.length)
    ) {
      return true;
    }
    return false;
  }

  private async ensureEnrichedDetails(
    details: WineLookupResult,
  ): Promise<WineLookupResult | null> {
    if (!this.needsEnrichment(details.wine)) {
      return details;
    }

    let wine: WineDetails = { ...details.wine };
    if (wine.description && !wine.descriptionEn) {
      wine = { ...wine, descriptionEn: wine.description };
    }
    if (wine.region && !wine.regionEn) {
      wine = { ...wine, regionEn: wine.region };
    }
    if (wine.country && !wine.countryEn) {
      wine = { ...wine, countryEn: wine.country };
    }
    if (wine.style && !wine.styleEn) {
      wine = { ...wine, styleEn: wine.style };
    }
    if (wine.grapes?.length && !wine.grapesEn?.length) {
      wine = { ...wine, grapesEn: wine.grapes };
    }
    if (wine.allergens?.length && !wine.allergensEn?.length) {
      wine = { ...wine, allergensEn: wine.allergens };
    }
    const name = details.name;

    try {
      const enrichment = await this.openai.enrichWineFromWeb({
        name,
        winery: wine.winery,
        year: wine.year,
        region: wine.regionEn || wine.region,
        country: wine.countryEn || wine.country,
        style: wine.styleEn || wine.style,
        grapes: wine.grapesEn || wine.grapes,
        vivinoUrl: wine.vivinoUrl,
        vivinoWineId: wine.vivinoWineId,
        vivinoVintageId: wine.vivinoVintageId,
      });
      wine = this.mergeWineDetails(wine, enrichment.wine);

      const imageSource =
        enrichment.imageCandidates[0] ||
        (wine.imageUrl?.startsWith('http') ? wine.imageUrl : undefined);
      if (!wine.imageKey && imageSource) {
        const cachedKey = await this.cacheBottleImage(
          wine.vivinoVintageId ?? wine.vivinoWineId ?? name,
          imageSource,
        );
        if (cachedKey) {
          wine = { ...wine, imageKey: cachedKey };
        }
      }
    } catch (error) {
      this.logger.warn(
        `ChatGPT wine enrichment skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );

      // Still try to cache a Vivino image when enrichment fails.
      if (!wine.imageKey && wine.imageUrl?.startsWith('http')) {
        const cachedKey = await this.cacheBottleImage(
          wine.vivinoVintageId ?? wine.vivinoWineId ?? name,
          wine.imageUrl,
        );
        if (cachedKey) {
          wine = { ...wine, imageKey: cachedKey };
        }
      }
    }

    const result = { name, wine };
    await this.cacheDetails(result, { enriched: true });
    return result;
  }

  private mergeWineDetails(
    base: WineDetails,
    patch: Partial<WineDetails>,
  ): WineDetails {
    const grapesEn =
      base.grapesEn?.length || base.grapes?.length
        ? base.grapesEn ?? base.grapes
        : patch.grapesEn ?? patch.grapes;
    const grapesEs = base.grapesEs?.length ? base.grapesEs : patch.grapesEs;
    const allergensEn =
      base.allergensEn?.length || base.allergens?.length
        ? base.allergensEn ?? base.allergens
        : patch.allergensEn ?? patch.allergens;
    const allergensEs = base.allergensEs?.length
      ? base.allergensEs
      : patch.allergensEs;
    const regionEn =
      base.regionEn || base.region || patch.regionEn || patch.region;
    const regionEs = base.regionEs || patch.regionEs;
    const countryEn =
      base.countryEn || base.country || patch.countryEn || patch.country;
    const countryEs = base.countryEs || patch.countryEs;
    const styleEn = base.styleEn || base.style || patch.styleEn || patch.style;
    const styleEs = base.styleEs || patch.styleEs;
    const descriptionEn =
      base.descriptionEn ||
      patch.descriptionEn ||
      patch.description ||
      base.description;
    const descriptionEs = base.descriptionEs || patch.descriptionEs;

    return {
      ...base,
      winery: base.winery || patch.winery,
      grapes: grapesEn,
      grapesEn,
      grapesEs,
      region: regionEn,
      regionEn,
      regionEs,
      country: countryEn,
      countryEn,
      countryEs,
      style: styleEn,
      styleEn,
      styleEs,
      alcoholPercentage: base.alcoholPercentage ?? patch.alcoholPercentage,
      allergens: allergensEn,
      allergensEn,
      allergensEs,
      descriptionEn,
      descriptionEs,
      description: descriptionEn || descriptionEs,
      price: base.price ?? patch.price,
      priceCurrency: base.priceCurrency || patch.priceCurrency,
      rating: base.rating ?? patch.rating,
      year: base.year || patch.year,
    };
  }

  private async cacheBottleImage(
    idHint: string,
    sourceUrl: string,
  ): Promise<string | undefined> {
    try {
      const urlPath = new URL(sourceUrl).pathname;
      const extMatch = urlPath.match(/\.([a-zA-Z0-9]{3,4})$/);
      const extension = extMatch?.[1]?.toLowerCase() ?? 'jpg';
      const key = this.s3Service.catalogWineImageKey(idHint, extension);
      await this.s3Service.putObjectFromUrl(key, sourceUrl);
      return key;
    } catch (error) {
      this.logger.warn(
        `Wine image cache failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return undefined;
    }
  }

  private async withResolvedImage(
    details: WineLookupResult,
  ): Promise<WineLookupResult> {
    return {
      name: details.name,
      wine: await this.resolveWineImage(details.wine),
    };
  }

  private async resolveWineImage(wine: WineDetails): Promise<WineDetails> {
    if (!wine.imageKey) return wine;
    try {
      const imageUrl = await this.s3Service.createViewUrl(wine.imageKey);
      return { ...wine, imageUrl };
    } catch {
      return wine;
    }
  }

  private mapLocalItem(item: Item): WineSearchResult {
    const wine = item.wine;
    const winery = wine?.winery;
    const year = wine?.year;
    const displayName = [winery, item.name, year].filter(Boolean).join(' · ');
    const wineId = wine?.vivinoWineId ?? item.id;

    return {
      wineId,
      vintageId: wine?.vivinoVintageId,
      name: item.name,
      displayName: displayName || item.name,
      winery,
      region: wine?.region,
      country: wine?.country,
      year,
      rating: wine?.rating,
      imageUrl: wine?.imageUrl,
      vivinoUrl:
        wine?.vivinoUrl ??
        (wine?.vivinoWineId
          ? buildVivinoWineUrl({ wineId: wine.vivinoWineId })
          : ''),
      source: 'local',
      itemId: item.id,
    };
  }

  private async searchRemote(
    query: string,
    limit: number,
  ): Promise<WineSearchResult[]> {
    if (limit <= 0) return [];

    const cached = await this.getCachedSearch(query);
    if (cached) {
      return cached.slice(0, limit).map((result) => ({
        ...result,
        source: 'cache' as const,
      }));
    }

    try {
      const live = await searchVivinoAlgolia(query, limit);
      await this.cacheSearch(query, live);
      return live.slice(0, limit);
    } catch (error) {
      this.logger.warn(
        `Vivino search failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new BadRequestException('Could not search Vivino right now');
    }
  }

  private mergeResults(
    local: WineSearchResult[],
    remote: WineSearchResult[],
    limit: number,
  ): WineSearchResult[] {
    const seen = new Set<string>();
    const merged: WineSearchResult[] = [];

    for (const result of [...local, ...remote]) {
      const key =
        result.itemId ??
        result.vintageId ??
        result.wineId ??
        result.displayName;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= limit) break;
    }

    return merged;
  }

  private async lookupFromLocalItem(
    userId: string,
    itemId: string,
  ): Promise<WineLookupResult | null> {
    try {
      const item = await this.itemsService.findOne(userId, itemId);
      if (item.category !== ItemCategory.Wine || !item.wine) return null;
      return { name: item.name, wine: item.wine };
    } catch {
      return null;
    }
  }

  private normalizeQueryKey(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async getCachedSearch(
    query: string,
  ): Promise<WineSearchResult[] | null> {
    const queryKey = this.normalizeQueryKey(query);
    const row = await this.searchCacheModel.findOne({ queryKey }).exec();
    if (!row) return null;

    const updatedAt = row.updatedAt?.getTime?.() ?? 0;
    if (Date.now() - updatedAt > SEARCH_CACHE_TTL_MS) {
      return null;
    }
    return row.results ?? [];
  }

  private async cacheSearch(query: string, results: WineSearchResult[]) {
    const queryKey = this.normalizeQueryKey(query);
    await this.searchCacheModel
      .findOneAndUpdate(
        { queryKey },
        {
          $set: {
            queryKey,
            results: results.map((result) => ({
              ...result,
              source: 'vivino',
            })),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  private async getCachedDetails(
    vintageId: string,
  ): Promise<WineLookupResult | null> {
    const catalog = await this.catalogService.getWineByVivinoVintageId(vintageId);
    if (catalog) {
      const updatedAt = catalog.updatedAt?.getTime?.() ?? 0;
      if (Date.now() - updatedAt <= DETAILS_CACHE_TTL_MS) {
        return { name: catalog.name, wine: catalog.wine };
      }
    }

    const row = await this.detailsCacheModel
      .findOne({ vivinoVintageId: vintageId })
      .exec();
    if (!row) return null;

    const updatedAt = row.updatedAt?.getTime?.() ?? 0;
    if (Date.now() - updatedAt > DETAILS_CACHE_TTL_MS) {
      return null;
    }
    // Promote legacy cache row into shared catalog.
    void this.catalogService.ensureWineCatalog({
      name: row.name,
      wine: row.wine,
      enrichedAt: row.enrichedAt,
    });
    return { name: row.name, wine: row.wine };
  }

  private async cacheDetails(
    details: WineLookupResult,
    options?: { enriched?: boolean },
  ) {
    const vintageId = details.wine.vivinoVintageId;
    if (!vintageId) return;

    await this.catalogService.ensureWineCatalog({
      name: details.name,
      wine: details.wine,
      enrichedAt: options?.enriched ? new Date() : undefined,
    });

    await this.detailsCacheModel
      .findOneAndUpdate(
        { vivinoVintageId: vintageId },
        {
          $set: {
            vivinoVintageId: vintageId,
            vivinoWineId: details.wine.vivinoWineId,
            name: details.name,
            wine: details.wine,
            ...(options?.enriched ? { enrichedAt: new Date() } : {}),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  private async resolveVintageIdForWine(
    wineId: string,
  ): Promise<string | undefined> {
    const fromCatalog = await this.catalogService.getWineByVivinoWineId(wineId);
    if (fromCatalog?.vivinoVintageId) {
      const updatedAt = fromCatalog.updatedAt?.getTime?.() ?? 0;
      if (Date.now() - updatedAt <= DETAILS_CACHE_TTL_MS) {
        return fromCatalog.vivinoVintageId;
      }
    }

    const cached = await this.detailsCacheModel
      .findOne({ vivinoWineId: wineId })
      .sort({ updatedAt: -1 })
      .exec();
    if (cached?.vivinoVintageId) {
      const updatedAt = cached.updatedAt?.getTime?.() ?? 0;
      if (Date.now() - updatedAt <= DETAILS_CACHE_TTL_MS) {
        return cached.vivinoVintageId;
      }
    }

    const data = await vivinoFetchJson(
      `https://9TAKGWJUXL-dsn.algolia.net/1/indexes/WINES_prod/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-algolia-application-id':
            process.env.VIVINO_ALGOLIA_APP_ID ?? '9TAKGWJUXL',
          'x-algolia-api-key':
            process.env.VIVINO_ALGOLIA_API_KEY ??
            '60c11b2f1068885161d95ca068d3a6ae',
        },
        body: JSON.stringify({
          params: new URLSearchParams({
            query: '',
            filters: `id=${wineId}`,
            hitsPerPage: '1',
          }).toString(),
        }),
      },
    );

    const hits = Array.isArray(data['hits']) ? data['hits'] : [];
    const hit = hits[0];
    if (!hit || typeof hit !== 'object') return undefined;
    const mapped = mapAlgoliaHit(hit as Record<string, unknown>);
    return mapped?.vintageId;
  }
}
