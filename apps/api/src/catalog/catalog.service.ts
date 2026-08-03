import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  CatalogKind,
  ItemCategory,
  Location,
  PlaceDetails,
  WineDetails,
  categoryHasLocation,
  isWineCategory,
} from '@org/domain';
import { Model, Types } from 'mongoose';
import { OpenAiService } from '../openai/openai.service.js';
import { PlacesService } from '../places/places.service.js';
import { S3Service } from '../storage/s3.service.js';
import {
  CatalogPlace,
  CatalogPlaceDocument,
} from './catalog-place.schema.js';
import {
  CatalogWine,
  CatalogWineDocument,
} from './catalog-wine.schema.js';
import {
  mapCatalogPlace,
  mapCatalogWine,
  stripPlaceDetailsForStorage,
} from './catalog.mapper.js';
import { createJpegThumb } from '../storage/image-resize.js';

export type CatalogProjection = {
  catalogKind: CatalogKind;
  catalogId: string;
  name?: string;
  nameEn?: string;
  nameEs?: string;
  location?: Location;
  place?: PlaceDetails;
  wine?: WineDetails;
};

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly enrichingPlaceIds = new Set<string>();
  private readonly thumbingPlaceIds = new Set<string>();

  constructor(
    @InjectModel(CatalogPlace.name)
    private readonly placeModel: Model<CatalogPlaceDocument>,
    @InjectModel(CatalogWine.name)
    private readonly wineModel: Model<CatalogWineDocument>,
    private readonly placesService: PlacesService,
    private readonly s3Service: S3Service,
    private readonly openai: OpenAiService,
  ) {}

  static placeExternalId(location?: Location): string | undefined {
    if (!location) return undefined;
    if (location.googlePlaceId?.trim()) {
      return location.googlePlaceId.trim();
    }
    if (
      typeof location.latitude === 'number' &&
      typeof location.longitude === 'number' &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude)
    ) {
      return `osm:${location.latitude},${location.longitude}`;
    }
    return undefined;
  }

  static wineExternalId(wine?: WineDetails, name?: string): string | undefined {
    if (wine?.vivinoVintageId?.trim()) {
      return wine.vivinoVintageId.trim();
    }
    if (wine?.vivinoWineId?.trim()) {
      return `wine:${wine.vivinoWineId.trim()}`;
    }
    const slug = name?.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);
    if (slug) return `local:${slug}`;
    return undefined;
  }

  async getPlaceById(id: string): Promise<CatalogPlaceDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.placeModel.findById(id).exec();
  }

  async getWineById(id: string): Promise<CatalogWineDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.wineModel.findById(id).exec();
  }

  async getPlaceByExternalId(
    externalId: string,
  ): Promise<CatalogPlaceDocument | null> {
    return this.placeModel.findOne({ externalId }).exec();
  }

  async getWineByExternalId(
    externalId: string,
  ): Promise<CatalogWineDocument | null> {
    return this.wineModel.findOne({ externalId }).exec();
  }

  async getWineByVivinoVintageId(
    vivinoVintageId: string,
  ): Promise<CatalogWineDocument | null> {
    return this.wineModel.findOne({ vivinoVintageId }).exec();
  }

  async getWineByVivinoWineId(
    vivinoWineId: string,
  ): Promise<CatalogWineDocument | null> {
    return this.wineModel
      .findOne({ vivinoWineId })
      .sort({ updatedAt: -1 })
      .exec();
  }

  /**
   * Upsert a shared place catalog row from location (+ optional existing place details).
   */
  async ensurePlaceCatalog(input: {
    name: string;
    nameEn?: string;
    nameEs?: string;
    category: ItemCategory;
    location: Location;
    place?: PlaceDetails;
  }): Promise<CatalogPlaceDocument> {
    const externalId =
      CatalogService.placeExternalId(input.location) ??
      `name:${input.name.trim().toLowerCase().slice(0, 80)}`;

    const location: Location = {
      ...input.location,
      googlePlaceId:
        input.location.googlePlaceId ??
        (externalId.startsWith('osm:') || externalId.startsWith('name:')
          ? undefined
          : externalId),
      placeId: input.location.placeId ?? input.location.googlePlaceId,
    };

    const existing = await this.placeModel.findOne({ externalId }).exec();
    if (existing) {
      let dirty = false;
      if (!existing.name && input.name) {
        existing.name = input.name;
        dirty = true;
      }
      if (input.nameEn && !existing.nameEn) {
        existing.nameEn = input.nameEn;
        dirty = true;
      }
      if (input.nameEs && !existing.nameEs) {
        existing.nameEs = input.nameEs;
        dirty = true;
      }
      if (input.place && !existing.place?.enrichedAt) {
        existing.place = {
          ...existing.place,
          ...stripPlaceDetailsForStorage(input.place),
        };
        dirty = true;
      }
      // Merge missing location fields
      for (const key of Object.keys(location) as (keyof Location)[]) {
        const value = location[key];
        if (value != null && (existing.location as Location)?.[key] == null) {
          (existing.location as Record<string, unknown>)[key] = value;
          dirty = true;
        }
      }
      if (dirty) await existing.save();
      return existing;
    }

    return this.placeModel.create({
      externalId,
      name: input.name,
      nameEn: input.nameEn,
      nameEs: input.nameEs,
      category: input.category,
      location,
      place: stripPlaceDetailsForStorage(input.place),
    });
  }

  /**
   * Upsert a shared wine catalog row.
   */
  async ensureWineCatalog(input: {
    name: string;
    nameEn?: string;
    nameEs?: string;
    wine?: WineDetails;
    enrichedAt?: Date;
  }): Promise<CatalogWineDocument> {
    const wine = input.wine ?? {};
    const externalId =
      CatalogService.wineExternalId(wine, input.name) ??
      `local:${Date.now()}`;

    const byVintage = wine.vivinoVintageId
      ? await this.wineModel
          .findOne({ vivinoVintageId: wine.vivinoVintageId })
          .exec()
      : null;
    const existing =
      byVintage ?? (await this.wineModel.findOne({ externalId }).exec());

    if (existing) {
      let dirty = false;
      if (input.name && existing.name !== input.name) {
        // Prefer richer Vivino names when present
        if (wine.vivinoVintageId || wine.vivinoWineId) {
          existing.name = input.name;
          dirty = true;
        }
      }
      if (input.nameEn && !existing.nameEn) {
        existing.nameEn = input.nameEn;
        dirty = true;
      }
      if (input.nameEs && !existing.nameEs) {
        existing.nameEs = input.nameEs;
        dirty = true;
      }
      const mergedWine = { ...existing.wine, ...wine };
      delete (mergedWine as { imageUrl?: string }).imageUrl;
      existing.wine = mergedWine;
      dirty = true;
      if (input.enrichedAt) {
        existing.enrichedAt = input.enrichedAt;
      }
      if (dirty) await existing.save();
      return existing;
    }

    const storedWine = { ...wine };
    delete (storedWine as { imageUrl?: string }).imageUrl;

    return this.wineModel.create({
      externalId,
      vivinoWineId: wine.vivinoWineId,
      vivinoVintageId: wine.vivinoVintageId,
      name: input.name,
      nameEn: input.nameEn,
      nameEs: input.nameEs,
      wine: storedWine,
      enrichedAt: input.enrichedAt,
    });
  }

  async ensureCatalogForItemWrite(input: {
    name: string;
    nameEn?: string;
    nameEs?: string;
    category: ItemCategory;
    location?: Location;
    place?: PlaceDetails;
    wine?: WineDetails;
  }): Promise<{ catalogKind: CatalogKind; catalogId: Types.ObjectId } | null> {
    if (isWineCategory(input.category)) {
      const doc = await this.ensureWineCatalog({
        name: input.name,
        nameEn: input.nameEn,
        nameEs: input.nameEs,
        wine: input.wine,
      });
      return {
        catalogKind: CatalogKind.Wine,
        catalogId: doc._id as Types.ObjectId,
      };
    }
    if (categoryHasLocation(input.category) && input.location) {
      const doc = await this.ensurePlaceCatalog({
        name: input.name,
        nameEn: input.nameEn,
        nameEs: input.nameEs,
        category: input.category,
        location: input.location,
        place: input.place,
      });
      return {
        catalogKind: CatalogKind.Place,
        catalogId: doc._id as Types.ObjectId,
      };
    }
    return null;
  }

  async projectOntoItems<T extends { catalogId?: string; catalogKind?: CatalogKind }>(
    items: T[],
  ): Promise<Array<T & CatalogProjection>> {
    const placeIds = new Set<string>();
    const wineIds = new Set<string>();
    for (const item of items) {
      if (!item.catalogId) continue;
      if (item.catalogKind === CatalogKind.Wine) wineIds.add(item.catalogId);
      else if (item.catalogKind === CatalogKind.Place) placeIds.add(item.catalogId);
    }

    const [places, wines] = await Promise.all([
      placeIds.size
        ? this.placeModel
            .find({
              _id: {
                $in: [...placeIds].map((id) => new Types.ObjectId(id)),
              },
            })
            .exec()
        : Promise.resolve([] as CatalogPlaceDocument[]),
      wineIds.size
        ? this.wineModel
            .find({
              _id: {
                $in: [...wineIds].map((id) => new Types.ObjectId(id)),
              },
            })
            .exec()
        : Promise.resolve([] as CatalogWineDocument[]),
    ]);

    const placeMap = new Map(
      places.map((doc) => [String(doc._id), mapCatalogPlace(doc)]),
    );
    const wineMap = new Map(
      wines.map((doc) => [String(doc._id), mapCatalogWine(doc)]),
    );

    return items.map((item) => {
      if (!item.catalogId) return item as T & CatalogProjection;
      if (item.catalogKind === CatalogKind.Wine) {
        const catalog = wineMap.get(item.catalogId);
        if (!catalog) return item as T & CatalogProjection;
        return {
          ...item,
          catalogKind: CatalogKind.Wine,
          catalogId: catalog.id,
          name: (item as { name?: string }).name || catalog.name,
          nameEn: (item as { nameEn?: string }).nameEn ?? catalog.nameEn,
          nameEs: (item as { nameEs?: string }).nameEs ?? catalog.nameEs,
          wine: catalog.wine,
          location: undefined,
          place: undefined,
        };
      }
      if (item.catalogKind === CatalogKind.Place) {
        const catalog = placeMap.get(item.catalogId);
        if (!catalog) return item as T & CatalogProjection;
        return {
          ...item,
          catalogKind: CatalogKind.Place,
          catalogId: catalog.id,
          name: (item as { name?: string }).name || catalog.name,
          nameEn: (item as { nameEn?: string }).nameEn ?? catalog.nameEn,
          nameEs: (item as { nameEs?: string }).nameEs ?? catalog.nameEs,
          location: catalog.location,
          place: catalog.place,
          wine: undefined,
        };
      }
      return item as T & CatalogProjection;
    });
  }

  /**
   * Enrich a catalog place once (Google rating, shared cover, tips).
   */
  async ensurePlaceGoogleEnrichment(
    catalogId: string,
  ): Promise<CatalogPlaceDocument | null> {
    const doc = await this.getPlaceById(catalogId);
    if (!doc) return null;
    if (doc.place?.enrichedAt) return doc;

    const googlePlaceId = doc.location?.googlePlaceId ?? doc.externalId;
    if (!googlePlaceId || googlePlaceId.startsWith('osm:') || googlePlaceId.startsWith('name:')) {
      doc.place = {
        ...doc.place,
        enrichedAt: new Date().toISOString(),
      };
      await doc.save();
      return doc;
    }

    if (this.enrichingPlaceIds.has(catalogId)) return doc;
    this.enrichingPlaceIds.add(catalogId);

    try {
      const details =
        await this.placesService.getGooglePlaceDetails(googlePlaceId);
      if (!details) {
        doc.place = {
          ...doc.place,
          enrichedAt: new Date().toISOString(),
        };
        await doc.save();
        return doc;
      }

      let coverPhotoKey = doc.place?.coverPhotoKey;
      let coverPhotoThumbKey = doc.place?.coverPhotoThumbKey;
      const firstPhoto = details.photos?.[0];
      if (!coverPhotoKey && firstPhoto?.name) {
        const photo = await this.placesService.fetchPlacePhoto(
          firstPhoto.name,
          800,
        );
        if (photo) {
          const extension = photo.contentType.includes('png')
            ? 'png'
            : photo.contentType.includes('webp')
              ? 'webp'
              : 'jpg';
          coverPhotoKey = this.s3Service.catalogPlaceCoverKey(
            String(doc._id),
            extension,
          );
          await this.s3Service.putObjectBuffer(
            coverPhotoKey,
            photo.buffer,
            photo.contentType,
          );
          coverPhotoThumbKey = await this.writeCoverThumb(
            String(doc._id),
            photo.buffer,
          );
        }
      } else if (coverPhotoKey && !coverPhotoThumbKey) {
        coverPhotoThumbKey =
          (await this.writeCoverThumbFromKey(String(doc._id), coverPhotoKey)) ??
          coverPhotoThumbKey;
      }

      let tipsEn = doc.place?.tipsEn;
      let tipsEs = doc.place?.tipsEs;
      if (!tipsEn && !tipsEs) {
        const reviewTexts = (details.reviews ?? [])
          .map((review) => review.text.trim())
          .filter(Boolean)
          .slice(0, 5);
        if (reviewTexts.length) {
          try {
            const tips = await this.openai.summarizePlaceReviews({
              name: doc.name,
              reviews: reviewTexts,
            });
            tipsEn = tips.tipsEn;
            tipsEs = tips.tipsEs;
          } catch (error) {
            this.logger.warn(
              `Catalog place tips skipped for ${catalogId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          }
        }
      }

      doc.place = {
        ...doc.place,
        googleRating: details.rating ?? doc.place?.googleRating,
        googleUserRatingCount:
          details.userRatingCount ?? doc.place?.googleUserRatingCount,
        coverPhotoKey,
        coverPhotoThumbKey,
        tipsEn,
        tipsEs,
        enrichedAt: new Date().toISOString(),
      };
      // Refresh location bits if missing
      if (details.city && !doc.location.city) doc.location.city = details.city;
      if (details.country && !doc.location.country) {
        doc.location.country = details.country;
      }
      if (details.googleMapsUrl && !doc.location.googleMapsUrl) {
        doc.location.googleMapsUrl = details.googleMapsUrl;
      }
      await doc.save();
      return doc;
    } catch (error) {
      this.logger.warn(
        `Catalog place enrichment skipped for ${catalogId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return doc;
    } finally {
      this.enrichingPlaceIds.delete(catalogId);
    }
  }

  /**
   * Ensure a list-sized cover thumbnail exists for an already-enriched place.
   * Generates it from the full S3 cover when missing.
   */
  async ensurePlaceCoverThumb(
    catalogId: string,
  ): Promise<CatalogPlaceDocument | null> {
    const doc = await this.getPlaceById(catalogId);
    if (!doc?.place?.coverPhotoKey) return doc;
    if (doc.place.coverPhotoThumbKey) return doc;
    if (this.thumbingPlaceIds.has(catalogId)) return doc;

    this.thumbingPlaceIds.add(catalogId);
    try {
      const thumbKey = await this.writeCoverThumbFromKey(
        String(doc._id),
        doc.place.coverPhotoKey,
      );
      if (!thumbKey) return doc;
      doc.place = {
        ...doc.place,
        coverPhotoThumbKey: thumbKey,
      };
      await doc.save();
      return doc;
    } catch (error) {
      this.logger.warn(
        `Catalog place cover thumb skipped for ${catalogId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return doc;
    } finally {
      this.thumbingPlaceIds.delete(catalogId);
    }
  }

  private async writeCoverThumbFromKey(
    catalogPlaceId: string,
    coverPhotoKey: string,
  ): Promise<string | undefined> {
    try {
      const buffer = await this.s3Service.getObjectBuffer(coverPhotoKey);
      return await this.writeCoverThumb(catalogPlaceId, buffer);
    } catch (error) {
      this.logger.warn(
        `Could not build cover thumb from ${coverPhotoKey}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return undefined;
    }
  }

  private async writeCoverThumb(
    catalogPlaceId: string,
    source: Buffer,
  ): Promise<string> {
    const thumbKey = this.s3Service.catalogPlaceCoverThumbKey(catalogPlaceId);
    const thumb = await createJpegThumb(source);
    await this.s3Service.putObjectBuffer(thumbKey, thumb, 'image/jpeg');
    return thumbKey;
  }

  async updateWineDetails(
    catalogId: string,
    wine: WineDetails,
    options?: { enriched?: boolean; name?: string },
  ): Promise<CatalogWineDocument | null> {
    const doc = await this.getWineById(catalogId);
    if (!doc) return null;
    const merged = { ...doc.wine, ...wine };
    delete (merged as { imageUrl?: string }).imageUrl;
    doc.wine = merged;
    if (options?.name) doc.name = options.name;
    if (options?.enriched) doc.enrichedAt = new Date();
    if (wine.vivinoWineId) doc.vivinoWineId = wine.vivinoWineId;
    if (wine.vivinoVintageId) doc.vivinoVintageId = wine.vivinoVintageId;
    await doc.save();
    return doc;
  }

  toEntityPlace(doc: CatalogPlaceDocument) {
    return mapCatalogPlace(doc);
  }

  toEntityWine(doc: CatalogWineDocument) {
    return mapCatalogWine(doc);
  }

  async requirePlace(id: string): Promise<CatalogPlaceDocument> {
    const doc = await this.getPlaceById(id);
    if (!doc) throw new NotFoundException('Catalog place not found');
    return doc;
  }

  async requireWine(id: string): Promise<CatalogWineDocument> {
    const doc = await this.getWineById(id);
    if (!doc) throw new NotFoundException('Catalog wine not found');
    return doc;
  }
}
