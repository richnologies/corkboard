import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { categoryHasLocation, ItemStatus } from '@org/domain';
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

@Injectable()
export class ItemsService implements OnModuleInit {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @Inject(forwardRef(() => SharingService))
    private readonly sharingService: SharingService,
    @Inject(forwardRef(() => ExperiencesService))
    private readonly experiencesService: ExperiencesService,
    private readonly peopleService: PeopleService,
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
    const item = await this.itemModel.create(payload);
    return mapItem(item);
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
    if (query.sourceType) filter['source.type'] = query.sourceType;
    if (query.referrerName) {
      filter['source.referrerName'] = new RegExp(query.referrerName, 'i');
    }
    if (query.tag) filter.tags = query.tag;

    const search = (query.q ?? query.city)?.trim();
    if (search) {
      const searchFilter =
        query.q != null
          ? this.buildItemSearchFilter(search)
          : { 'location.city': new RegExp(this.escapeRegex(search), 'i') };
      filter.$and!.push(searchFilter);
    }

    const items = await this.itemModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();
    const latestVisits = await this.experiencesService.findLatestForItems(
      userId,
      items.map((item) => item.id),
    );
    return items.map((doc) => {
      const item = mapItem(doc);
      const latest = latestVisits.get(item.id);
      return latest
        ? { ...item, latestVisit: mapLatestVisitSummary(latest) }
        : item;
    });
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
      'location.city',
      'location.country',
      'location.region',
      'location.address',
      'tags',
      'source.referrerName',
      'source.notes',
      'rejectionReason',
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

  async findOne(userId: string, itemId: string) {
    const item = await this.getAccessibleItem(userId, itemId);
    return mapItem(item);
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
    return mapItem(item!);
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
}
