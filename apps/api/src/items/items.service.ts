import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  categoryHasLocation,
  hasBothLocales,
  ItemCategory,
  ItemStatus,
  isWineCategory,
  locationMatchesQuery,
  Item as ItemEntity,
  Location,
  WineDetails,
} from '@org/domain';
import { Item, ItemDocument } from './item.schema.js';
import { CreateItemDto, ItemQueryDto, UpdateItemDto } from './dto/item.dto.js';
import { SharingService } from '../sharing/sharing.service.js';
import { mapItem, mapLatestVisitSummary } from '../common/mappers.js';
import { ExperiencesService } from '../experiences/experiences.service.js';
import {
  migrateLegacyFavoriteItem,
  prepareItemWrite,
} from './item-normalize.js';
import { PeopleService } from '../people/people.service.js';
import { S3Service } from '../storage/s3.service.js';
import { OpenAiService } from '../openai/openai.service.js';

@Injectable()
export class ItemsService implements OnModuleInit {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @Inject(forwardRef(() => SharingService))
    private readonly sharingService: SharingService,
    @Inject(forwardRef(() => ExperiencesService))
    private readonly experiencesService: ExperiencesService,
    private readonly peopleService: PeopleService,
    private readonly s3Service: S3Service,
    private readonly openai: OpenAiService,
  ) {}

  async onModuleInit() {
    const legacyItems = await this.itemModel.find({ status: 'favorite' }).exec();
    for (const item of legacyItems) {
      const migrated = migrateLegacyFavoriteItem(item);
      if (!migrated) continue;
      item.status = migrated.status;
      item.tags = migrated.tags;
      await item.save();
    }
  }

  async create(ownerId: string, dto: CreateItemDto) {
    const prepared = prepareItemWrite(dto);
    const resolvedSource = dto.source
      ? await this.peopleService.resolveSourceForWrite(ownerId, dto.source)
      : undefined;
    const payload: Record<string, unknown> = {
      ownerId: new Types.ObjectId(ownerId),
      ...dto,
      ...prepared,
      status: prepared.status ?? dto.status,
      source: resolvedSource,
    };
    delete payload.unsetRejectionReason;
    if (!categoryHasLocation(dto.category)) {
      delete payload.location;
    }
    if (!isWineCategory(dto.category)) {
      delete payload.wine;
    }
    const item = await this.itemModel.create(payload);
    return this.withResolvedWineImage(mapItem(item));
  }

  async findAll(userId: string, query: ItemQueryDto) {
    const sharedIds = await this.sharingService.findAccessibleItemIds(userId);
    const filter: FilterQuery<ItemDocument> = {
      $and: [
        {
          $or: [
            { ownerId: new Types.ObjectId(userId) },
            ...(sharedIds.length
              ? [{ _id: { $in: sharedIds.map((id) => new Types.ObjectId(id)) } }]
              : []),
          ],
        },
      ],
    };

    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    else if (query.excludeCategory) {
      filter.category = { $ne: query.excludeCategory };
    }
    if (query.sourceType) filter['source.type'] = query.sourceType;
    if (query.referrerName) {
      filter['source.referrerName'] = new RegExp(query.referrerName, 'i');
    }
    if (query.tag) filter.tags = query.tag;

    if (query.city?.trim()) {
      filter.$and!.push(this.buildLocationFieldFilter('location.city', query.city));
    }
    if (query.country?.trim()) {
      filter.$and!.push(
        this.buildLocationFieldFilter('location.country', query.country),
      );
    }

    const search = query.q?.trim();
    if (search) {
      filter.$and!.push(this.buildItemSearchFilter(search));
    }

    const items = await this.itemModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();
    const latestVisits = await this.experiencesService.findLatestForItems(
      userId,
      items.map((item) => item.id),
    );
    const mapped = items.map((doc) => {
      const item = mapItem(doc);
      const latest = latestVisits.get(item.id);
      return latest
        ? { ...item, latestVisit: mapLatestVisitSummary(latest) }
        : item;
    });
    return Promise.all(mapped.map((item) => this.withResolvedWineImage(item)));
  }

  private readonly searchStopWords = new Set([
    'the',
    'a',
    'an',
    'to',
    'at',
    'in',
    'on',
    'for',
    'with',
    'my',
    'me',
    'restaurant',
    'restaurants',
    'cafe',
    'café',
    'bar',
    'pub',
    'place',
    'places',
    'el',
    'la',
    'los',
    'las',
    'de',
    'del',
    'restaurante',
    'lugar',
  ]);

  private buildItemSearchFilter(search: string): Record<string, unknown> {
    const terms = this.searchTerms(search);
    const fields = [
      'name',
      'nameEn',
      'nameEs',
      'location.city',
      'location.cityEn',
      'location.cityEs',
      'location.country',
      'location.countryEn',
      'location.countryEs',
      'location.region',
      'location.regionEn',
      'location.regionEs',
      'location.address',
      'location.addressEn',
      'location.addressEs',
      'tags',
      'source.referrerName',
      'source.notes',
      'rejectionReason',
      'wine.winery',
      'wine.region',
      'wine.regionEn',
      'wine.regionEs',
      'wine.country',
      'wine.countryEn',
      'wine.countryEs',
      'wine.style',
      'wine.styleEn',
      'wine.styleEs',
      'wine.year',
      'wine.grapes',
      'wine.grapesEn',
      'wine.grapesEs',
      'wine.description',
      'wine.descriptionEn',
      'wine.descriptionEs',
      'wine.vivinoWineId',
    ];

    const termFilters = terms.map((term) => {
      const pattern = new RegExp(this.escapeRegex(term), 'i');
      return {
        $or: fields.map((field) => ({ [field]: pattern })),
      };
    });

    return termFilters.length === 1 ? termFilters[0] : { $and: termFilters };
  }

  private searchTerms(query: string): string[] {
    const terms = query
      .trim()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
      .filter((term) => !this.searchStopWords.has(term.toLowerCase()));

    if (terms.length) return terms;

    const fallback = query.trim();
    return fallback ? [fallback] : [];
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildLocationFieldFilter(
    field: string,
    value: string,
  ): Record<string, unknown> {
    const pattern = new RegExp(this.escapeRegex(value.trim()), 'i');
    return {
      $or: [
        { [field]: pattern },
        { [`${field}En`]: pattern },
        { [`${field}Es`]: pattern },
      ],
    };
  }

  async findVisitedPlaces(
    userId: string,
    filters: {
      city?: string;
      country?: string;
      category?: ItemQueryDto['category'];
      q?: string;
    },
  ) {
    const items = await this.findAll(userId, {
      category: filters.category,
      q: filters.q?.trim() || undefined,
    });

    let visited = items.filter((item) => item.latestVisit);

    if (filters.city?.trim()) {
      const city = filters.city.trim();
      visited = visited.filter((item) =>
        locationMatchesQuery(item.location, city),
      );
    }
    if (filters.country?.trim()) {
      const country = filters.country.trim();
      visited = visited.filter((item) =>
        locationMatchesQuery(item.location, country),
      );
    }

    return visited;
  }

  async findOne(userId: string, itemId: string) {
    const item = await this.getAccessibleItem(userId, itemId);
    const mapped = await this.withResolvedWineImage(mapItem(item));
    return this.ensurePlaceLocalized(userId, mapped);
  }

  async findOwnedByGooglePlaceId(ownerId: string, googlePlaceId: string) {
    const item = await this.itemModel
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
        'location.googlePlaceId': googlePlaceId,
      })
      .exec();
    return item ? mapItem(item) : null;
  }

  async findOwnedByVivinoWineId(ownerId: string, vivinoWineId: string) {
    const item = await this.itemModel
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
        'wine.vivinoWineId': vivinoWineId,
      })
      .exec();
    return item ? mapItem(item) : null;
  }

  async findOwnedByVivinoVintageId(ownerId: string, vivinoVintageId: string) {
    const item = await this.itemModel
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
        'wine.vivinoVintageId': vivinoVintageId,
      })
      .exec();
    return item ? mapItem(item) : null;
  }

  async update(userId: string, itemId: string, dto: UpdateItemDto) {
    await this.assertCanEdit(userId, itemId);
    const existing = await this.itemModel.findById(itemId).exec();
    if (!existing) throw new NotFoundException('Item not found');

    const category = dto.category ?? existing.category;
    const prepared = prepareItemWrite(dto, existing);
    const resolvedSource =
      dto.source !== undefined
        ? await this.peopleService.resolveSourceForWrite(userId, dto.source)
        : undefined;
    const update: Record<string, unknown> = { ...dto, ...prepared };
    if (resolvedSource !== undefined) {
      update.source = resolvedSource;
    }
    delete update.unsetRejectionReason;

    const unset: Record<string, 1> = {};
    if (!categoryHasLocation(category)) {
      unset.location = 1;
    }
    if (!isWineCategory(category)) {
      unset.wine = 1;
      delete update.wine;
    }
    if (prepared.unsetRejectionReason) {
      unset.rejectionReason = 1;
      delete update.rejectionReason;
    }

    const item = await this.itemModel
      .findByIdAndUpdate(
        itemId,
        {
          ...(Object.keys(update).length ? { $set: update } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true },
      )
      .exec();
    return this.withResolvedWineImage(mapItem(item!));
  }

  async remove(userId: string, itemId: string) {
    await this.assertIsOwner(userId, itemId);
    await this.itemModel.findByIdAndDelete(itemId).exec();
  }

  async getAccessibleItem(
    userId: string,
    itemId: string,
  ): Promise<ItemDocument> {
    const item = await this.itemModel.findById(itemId).exec();
    if (!item) throw new NotFoundException('Item not found');

    const isOwner = String(item.ownerId) === userId;
    if (isOwner) return item;

    const share = await this.sharingService.findShare(itemId, userId);
    const permission = this.sharingService.getPermission(share, isOwner);
    if (!this.sharingService.canView(permission)) {
      throw new ForbiddenException('You do not have access to this item');
    }
    return item;
  }

  /** Lightweight lookup for experience enrichment (no access check). */
  async findSummariesByIds(
    itemIds: string[],
  ): Promise<Map<string, { id: string; name: string; category: ItemCategory }>> {
    const unique = [...new Set(itemIds.filter((id) => Types.ObjectId.isValid(id)))];
    if (!unique.length) return new Map();

    const docs = await this.itemModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select({ name: 1, category: 1 })
      .exec();

    return new Map(
      docs.map((doc) => [
        doc.id,
        { id: doc.id, name: doc.name, category: doc.category },
      ]),
    );
  }

  async assertCanEdit(userId: string, itemId: string): Promise<void> {
    const item = await this.itemModel.findById(itemId).exec();
    if (!item) throw new NotFoundException('Item not found');

    const isOwner = String(item.ownerId) === userId;
    const share = await this.sharingService.findShare(itemId, userId);
    const permission = this.sharingService.getPermission(share, isOwner);
    if (!this.sharingService.canEdit(permission)) {
      throw new ForbiddenException(
        'You do not have permission to edit this item',
      );
    }
  }

  async assertIsOwner(userId: string, itemId: string): Promise<void> {
    const item = await this.itemModel.findById(itemId).exec();
    if (!item) throw new NotFoundException('Item not found');
    if (String(item.ownerId) !== userId) {
      throw new ForbiddenException('Only the owner can perform this action');
    }
  }

  getOwnerId(item: ItemDocument): string {
    return String(item.ownerId);
  }

  async markVisitedAfterExperience(userId: string, itemId: string) {
    try {
      await this.assertCanEdit(userId, itemId);
    } catch {
      return;
    }

    await this.itemModel.updateOne(
      {
        _id: itemId,
        status: { $nin: [ItemStatus.Visited, ItemStatus.Rejected] },
      },
      { $set: { status: ItemStatus.Visited } },
    );
  }

  private async withResolvedWineImage(item: ItemEntity): Promise<ItemEntity> {
    if (!item.wine?.imageKey) return item;
    try {
      const imageUrl = await this.s3Service.createViewUrl(item.wine.imageKey);
      const wine: WineDetails = { ...item.wine, imageUrl };
      return { ...item, wine };
    } catch {
      return item;
    }
  }

  private needsPlaceLocalization(item: ItemEntity): boolean {
    if (!categoryHasLocation(item.category) || isWineCategory(item.category)) {
      return false;
    }
    if (!hasBothLocales(item.nameEn, item.nameEs)) return true;
    const loc = item.location;
    if (!loc) return false;
    if (loc.city && !hasBothLocales(loc.cityEn, loc.cityEs)) return true;
    if (loc.country && !hasBothLocales(loc.countryEn, loc.countryEs)) {
      return true;
    }
    if (loc.region && !hasBothLocales(loc.regionEn, loc.regionEs)) return true;
    if (loc.address && !hasBothLocales(loc.addressEn, loc.addressEs)) {
      return true;
    }
    return false;
  }

  private async ensurePlaceLocalized(
    userId: string,
    item: ItemEntity,
  ): Promise<ItemEntity> {
    if (!this.needsPlaceLocalization(item)) return item;

    try {
      const enrichment = await this.openai.enrichPlaceFromWeb({
        name: item.name,
        address: item.location?.address,
        city: item.location?.city,
        region: item.location?.region,
        country: item.location?.country,
      });

      const nameEn = item.nameEn || enrichment.nameEn || item.name;
      const nameEs = item.nameEs || enrichment.nameEs || item.name;
      const location: Location | undefined = item.location
        ? {
            ...item.location,
            addressEn:
              item.location.addressEn ||
              enrichment.addressEn ||
              item.location.address,
            addressEs:
              item.location.addressEs ||
              enrichment.addressEs ||
              item.location.address,
            address:
              item.location.address ||
              enrichment.addressEn ||
              enrichment.addressEs,
            cityEn:
              item.location.cityEn || enrichment.cityEn || item.location.city,
            cityEs:
              item.location.cityEs || enrichment.cityEs || item.location.city,
            city:
              item.location.city || enrichment.cityEn || enrichment.cityEs,
            regionEn:
              item.location.regionEn ||
              enrichment.regionEn ||
              item.location.region,
            regionEs:
              item.location.regionEs ||
              enrichment.regionEs ||
              item.location.region,
            region:
              item.location.region ||
              enrichment.regionEn ||
              enrichment.regionEs,
            countryEn:
              item.location.countryEn ||
              enrichment.countryEn ||
              item.location.country,
            countryEs:
              item.location.countryEs ||
              enrichment.countryEs ||
              item.location.country,
            country:
              item.location.country ||
              enrichment.countryEn ||
              enrichment.countryEs,
          }
        : undefined;

      const updated = await this.update(userId, item.id, {
        nameEn,
        nameEs,
        ...(location ? { location } : {}),
      });
      return updated;
    } catch (error) {
      this.logger.warn(
        `Place localization skipped for ${item.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return item;
    }
  }
}
