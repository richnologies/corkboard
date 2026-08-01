import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExperienceVisibility, ItemCategory } from '@org/domain';
import { Experience, ExperienceDocument } from './experience.schema.js';
import {
  CreateExperienceDto,
  UpdateExperienceDto,
} from './dto/experience.dto.js';
import { ItemsService } from '../items/items.service.js';
import { S3Service } from '../storage/s3.service.js';
import { PeopleService } from '../people/people.service.js';
import { UsersService } from '../users/users.service.js';
import { SharingService } from '../sharing/sharing.service.js';
import { enrichExperience, mapExperience } from './experience.mapper.js';
import {
  canCreateExperience,
  canDeleteExperience,
  canEditExperience,
  canViewExperience,
  experienceAuthorId,
  experiencesForItemQuery,
  resolveItemAccess,
  toObjectId,
  toObjectIdArray,
} from './experience-access.js';
import { Experience as ExperienceEntity, ExperienceCalendarEntry } from '@org/domain';
import { ExperienceSearchIndexService } from './experience-search-index.service.js';

export interface LatestExperienceByItem {
  itemId: string;
  visitedAt: Date;
  rating?: Experience['rating'];
  notes?: string;
}

@Injectable()
export class ExperiencesService implements OnModuleInit {
  constructor(
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    @Inject(forwardRef(() => ItemsService))
    private readonly itemsService: ItemsService,
    private readonly s3Service: S3Service,
    private readonly peopleService: PeopleService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => SharingService))
    private readonly sharingService: SharingService,
    @Inject(forwardRef(() => ExperienceSearchIndexService))
    private readonly searchIndex: ExperienceSearchIndexService,
  ) {}

  async onModuleInit() {
    await this.migrateLegacyExperiences();
  }

  async create(userId: string, itemId: string, dto: CreateExperienceDto) {
    const item = await this.itemsService.getAccessibleItem(userId, itemId);
    const access = await resolveItemAccess(userId, item, (id, uid) =>
      this.sharingService.findShare(id, uid),
    );
    if (!canCreateExperience(access)) {
      throw new ForbiddenException(
        'You do not have permission to log visits on this item',
      );
    }

    this.validatePhotoKeys(userId, this.collectPhotoKeys(dto.photos ?? []));

    const companions = await this.peopleService.resolveCompanionsForWrite(
      userId,
      dto,
    );
    const participantUserIds = await this.resolveParticipantUserIds(
      userId,
      dto.participantUserIds,
    );
    const wineItemIds = await this.resolveWineItemIds(
      userId,
      itemId,
      dto.wineItemIds,
    );

    const experience = await this.experienceModel.create({
      itemId: toObjectId(itemId),
      authorId: toObjectId(userId),
      visibility: dto.visibility ?? ExperienceVisibility.Shared,
      participantUserIds,
      visitedAt: new Date(dto.visitedAt),
      rating: dto.rating,
      notes: dto.notes,
      wouldReturn: dto.wouldReturn,
      companionPersonIds: toObjectIdArray(companions.companionPersonIds),
      wineItemIds: toObjectIdArray(wineItemIds),
      photos: dto.photos ?? [],
    });

    await this.itemsService.markVisitedAfterExperience(userId, itemId);
    await Promise.all(
      wineItemIds.map((wineId) =>
        this.itemsService.markVisitedAfterExperience(userId, wineId),
      ),
    );
    this.searchIndex.scheduleIndex(experience.id);
    return this.enrichOne(userId, experience, access);
  }

  async enrichSearchResults(
    userId: string,
    experiences: ExperienceDocument[],
  ): Promise<ExperienceEntity[]> {
    const results: ExperienceEntity[] = [];
    for (const experience of experiences) {
      try {
        const item = await this.itemsService.getAccessibleItem(
          userId,
          String(experience.itemId),
        );
        const access = await resolveItemAccess(userId, item, (id, uid) =>
          this.sharingService.findShare(id, uid),
        );
        const [enriched] = await this.enrichMany(userId, [experience], access);
        if (enriched) results.push(enriched);
      } catch {
        // Skip inaccessible rows.
      }
    }
    return results;
  }

  async findByItem(userId: string, itemId: string): Promise<ExperienceEntity[]> {
    const item = await this.itemsService.getAccessibleItem(userId, itemId);
    const access = await resolveItemAccess(userId, item, (id, uid) =>
      this.sharingService.findShare(id, uid),
    );

    const experiences = await this.experienceModel
      .find(experiencesForItemQuery(itemId))
      .sort({ visitedAt: -1 })
      .exec();

    const visible: ExperienceDocument[] = [];
    for (const experience of experiences) {
      const primaryId = String(experience.itemId);
      if (primaryId === itemId) {
        if (canViewExperience(experience, userId, access)) {
          visible.push(experience);
        }
        continue;
      }

      // Linked via wineItemIds — access is based on the primary (place) item.
      try {
        const primaryItem = await this.itemsService.getAccessibleItem(
          userId,
          primaryId,
        );
        const primaryAccess = await resolveItemAccess(
          userId,
          primaryItem,
          (id, uid) => this.sharingService.findShare(id, uid),
        );
        if (canViewExperience(experience, userId, primaryAccess)) {
          visible.push(experience);
        }
      } catch {
        // Primary place not accessible — skip linked visit.
      }
    }

    return this.enrichMany(userId, visible, access);
  }

  async findByIdForUser(
    userId: string,
    experienceId: string,
  ): Promise<ExperienceEntity> {
    const experience = await this.getExperienceOrThrow(experienceId);
    const item = await this.itemsService.getAccessibleItem(
      userId,
      String(experience.itemId),
    );
    const access = await resolveItemAccess(userId, item, (id, uid) =>
      this.sharingService.findShare(id, uid),
    );

    if (!canViewExperience(experience, userId, access)) {
      throw new ForbiddenException('You do not have access to this visit');
    }

    const [enriched] = await this.enrichMany(userId, [experience], access);
    if (!enriched) {
      throw new NotFoundException('Experience not found');
    }
    return enriched;
  }

  async findForCalendar(
    userId: string,
    from: string,
    to: string,
  ): Promise<ExperienceCalendarEntry[]> {
    const fromDate = this.parseCalendarDate(from);
    const toExclusive = this.parseCalendarDate(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const uid = toObjectId(userId);
    const sharedItemIds =
      await this.sharingService.findAccessibleItemIds(userId);
    const sharedObjectIds = sharedItemIds.map((id) => toObjectId(id));

    const or: Record<string, unknown>[] = [
      { authorId: uid },
      { participantUserIds: uid },
    ];
    if (sharedObjectIds.length) {
      or.push({ itemId: { $in: sharedObjectIds } });
    }

    const experiences = await this.experienceModel
      .find({
        visitedAt: { $gte: fromDate, $lt: toExclusive },
        $or: or,
      })
      .sort({ visitedAt: -1 })
      .exec();

    const byItem = new Map<string, ExperienceDocument[]>();
    for (const experience of experiences) {
      const itemId = String(experience.itemId);
      const bucket = byItem.get(itemId);
      if (bucket) bucket.push(experience);
      else byItem.set(itemId, [experience]);
    }

    const results: ExperienceCalendarEntry[] = [];
    for (const [itemId, itemExperiences] of byItem) {
      try {
        const item = await this.itemsService.getAccessibleItem(userId, itemId);
        const access = await resolveItemAccess(userId, item, (id, shareUserId) =>
          this.sharingService.findShare(id, shareUserId),
        );
        const visible = itemExperiences.filter((experience) =>
          canViewExperience(experience, userId, access),
        );
        if (!visible.length) continue;

        const enriched = await this.enrichMany(userId, visible, access);
        for (const experience of enriched) {
          results.push({
            id: experience.id,
            itemId: experience.itemId,
            itemName: item.name,
            visitedAt: experience.visitedAt,
            rating: experience.rating,
            notes: experience.notes,
            companions: experience.companions,
            authorDisplayName: experience.authorDisplayName,
            photoCount: experience.photos?.length ?? 0,
            wines: experience.wines,
          });
        }
      } catch {
        // Item not accessible — skip.
      }
    }

    return results.sort(
      (a, b) =>
        new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
    );
  }

  async findLatestForItems(
    userId: string,
    itemIds: string[],
  ): Promise<Map<string, LatestExperienceByItem>> {
    if (!itemIds.length) return new Map();

    const objectIds = itemIds.map((id) => toObjectId(id));
    const itemIdSet = new Set(itemIds);

    const experiences = await this.experienceModel
      .find({
        $or: [
          { itemId: { $in: objectIds } },
          { wineItemIds: { $in: objectIds } },
        ],
      })
      .sort({ visitedAt: -1 })
      .exec();

    const accessByItem = new Map<
      string,
      Awaited<ReturnType<typeof resolveItemAccess>>
    >();
    for (const itemId of itemIds) {
      try {
        const item = await this.itemsService.getAccessibleItem(userId, itemId);
        accessByItem.set(
          itemId,
          await resolveItemAccess(userId, item, (id, uid) =>
            this.sharingService.findShare(id, uid),
          ),
        );
      } catch {
        // Item not accessible — skip.
      }
    }

    const primaryAccessCache = new Map<
      string,
      Awaited<ReturnType<typeof resolveItemAccess>> | null
    >();

    const map = new Map<string, LatestExperienceByItem>();
    for (const experience of experiences) {
      const primaryId = String(experience.itemId);
      const relatedIds = [
        primaryId,
        ...(experience.wineItemIds ?? []).map((id) => String(id)),
      ].filter((id) => itemIdSet.has(id) && !map.has(id));

      if (!relatedIds.length) continue;

      let primaryAccess = accessByItem.get(primaryId) ?? null;
      if (!primaryAccess && !primaryAccessCache.has(primaryId)) {
        try {
          const primaryItem = await this.itemsService.getAccessibleItem(
            userId,
            primaryId,
          );
          primaryAccessCache.set(
            primaryId,
            await resolveItemAccess(userId, primaryItem, (id, uid) =>
              this.sharingService.findShare(id, uid),
            ),
          );
        } catch {
          primaryAccessCache.set(primaryId, null);
        }
      }
      if (!primaryAccess) {
        primaryAccess = primaryAccessCache.get(primaryId) ?? null;
      }

      if (
        !primaryAccess ||
        !canViewExperience(experience, userId, primaryAccess)
      ) {
        continue;
      }

      for (const relatedId of relatedIds) {
        if (map.has(relatedId)) continue;
        if (relatedId === primaryId) {
          const access = accessByItem.get(relatedId);
          if (!access || !canViewExperience(experience, userId, access)) {
            continue;
          }
        }
        map.set(relatedId, {
          itemId: relatedId,
          visitedAt: experience.visitedAt,
          rating: experience.rating,
          notes: experience.notes,
        });
      }
    }
    return map;
  }

  async update(userId: string, experienceId: string, dto: UpdateExperienceDto) {
    const experience = await this.getExperienceOrThrow(experienceId);
    const item = await this.itemsService.getAccessibleItem(
      userId,
      String(experience.itemId),
    );
    const access = await resolveItemAccess(userId, item, (id, uid) =>
      this.sharingService.findShare(id, uid),
    );

    if (!canEditExperience(experience, userId, access)) {
      throw new ForbiddenException(
        'You do not have permission to edit this visit',
      );
    }

    if (dto.photos !== undefined) {
      this.validatePhotoKeysForUpdate(userId, experience, dto.photos);
      const newKeys = new Set(dto.photos.map((p) => p.key));
      for (const old of experience.photos ?? []) {
        if (!newKeys.has(old.key)) {
          await this.deletePhotoAssets(old);
        }
      }
    }

    if (dto.visitedAt) experience.visitedAt = new Date(dto.visitedAt);
    if (dto.rating !== undefined) experience.rating = dto.rating;
    if (dto.notes !== undefined) experience.notes = dto.notes;
    if (dto.wouldReturn !== undefined) experience.wouldReturn = dto.wouldReturn;
    if (dto.visibility !== undefined) experience.visibility = dto.visibility;
    if (dto.participantUserIds !== undefined) {
      experience.participantUserIds = await this.resolveParticipantUserIds(
        String(experience.authorId),
        dto.participantUserIds,
      );
    }
    if (
      dto.companions !== undefined ||
      dto.companionPersonIds !== undefined
    ) {
      const companions = await this.peopleService.resolveCompanionsForWrite(
        String(experience.authorId),
        dto,
      );
      experience.companionPersonIds = toObjectIdArray(
        companions.companionPersonIds,
      );
    }
    if (dto.wineItemIds !== undefined) {
      const wineItemIds = await this.resolveWineItemIds(
        userId,
        String(experience.itemId),
        dto.wineItemIds,
      );
      experience.wineItemIds = toObjectIdArray(wineItemIds);
      await Promise.all(
        wineItemIds.map((wineId) =>
          this.itemsService.markVisitedAfterExperience(userId, wineId),
        ),
      );
    }
    if (dto.photos !== undefined) experience.photos = dto.photos;

    await experience.save();
    this.searchIndex.scheduleIndex(experience.id);
    return this.enrichOne(userId, experience, access);
  }

  async assertCanViewPhoto(userId: string, key: string): Promise<void> {
    if (this.s3Service.isCatalogWineKey(key)) {
      return;
    }

    try {
      this.s3Service.assertUserKey(userId, key);
      return;
    } catch {
      // Photo may belong to another user on a shared visit.
    }

    const experience = await this.experienceModel
      .findOne({ $or: [{ 'photos.key': key }, { 'photos.thumbKey': key }] })
      .exec();
    if (!experience) {
      throw new BadRequestException('Invalid photo key');
    }

    const item = await this.itemsService.getAccessibleItem(
      userId,
      String(experience.itemId),
    );
    const access = await resolveItemAccess(userId, item, (id, uid) =>
      this.sharingService.findShare(id, uid),
    );
    if (!canViewExperience(experience, userId, access)) {
      throw new BadRequestException('Invalid photo key');
    }
  }

  async remove(userId: string, experienceId: string) {
    const experience = await this.getExperienceOrThrow(experienceId);
    const item = await this.itemsService.getAccessibleItem(
      userId,
      String(experience.itemId),
    );
    const access = await resolveItemAccess(userId, item, (id, uid) =>
      this.sharingService.findShare(id, uid),
    );

    if (!canDeleteExperience(experience, userId, access)) {
      throw new ForbiddenException(
        'You do not have permission to delete this visit',
      );
    }

    for (const photo of experience.photos ?? []) {
      await this.deletePhotoAssets(photo);
    }

    await this.experienceModel.findByIdAndDelete(experienceId).exec();
  }

  private async enrichOne(
    userId: string,
    experience: ExperienceDocument,
    access: Awaited<ReturnType<typeof resolveItemAccess>>,
  ) {
    const [enriched] = await this.enrichMany(userId, [experience], access);
    return enriched;
  }

  private async enrichMany(
    userId: string,
    experiences: ExperienceDocument[],
    access: Awaited<ReturnType<typeof resolveItemAccess>>,
  ): Promise<ExperienceEntity[]> {
    if (!experiences.length) return [];

    const authorIds = [
      ...new Set(
        experiences
          .map((experience) => experienceAuthorId(experience))
          .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
      ),
    ];
    const authors = await this.usersService.findByIds(authorIds);
    const authorNames = new Map(
      authors.map((author) => [author.id, author.displayName]),
    );

    const companionNamesByExperience = new Map<string, string[]>();
    for (const experience of experiences) {
      const ownerId = experienceAuthorId(experience);
      const personIds = (experience.companionPersonIds ?? []).map((id) =>
        String(id),
      );
      if (!ownerId || !personIds.length) {
        companionNamesByExperience.set(experience.id, []);
        continue;
      }
      const people = await this.peopleService.findByIds(ownerId, personIds);
      const byId = new Map(people.map((person) => [person.id, person.name]));
      companionNamesByExperience.set(
        experience.id,
        personIds.map((id) => byId.get(id)).filter((name): name is string => !!name),
      );
    }

    const relatedItemIds = [
      ...new Set(
        experiences.flatMap((experience) => [
          String(experience.itemId),
          ...(experience.wineItemIds ?? []).map((id) => String(id)),
        ]),
      ),
    ];
    const itemSummaries =
      await this.itemsService.findSummariesByIds(relatedItemIds);

    const primaryAccessById = new Map<
      string,
      Awaited<ReturnType<typeof resolveItemAccess>>
    >();
    const viewingItemId = String(access.item._id ?? access.item.id);
    primaryAccessById.set(viewingItemId, access);

    for (const experience of experiences) {
      const primaryId = String(experience.itemId);
      if (primaryAccessById.has(primaryId)) continue;
      try {
        const primaryItem = await this.itemsService.getAccessibleItem(
          userId,
          primaryId,
        );
        primaryAccessById.set(
          primaryId,
          await resolveItemAccess(userId, primaryItem, (id, uid) =>
            this.sharingService.findShare(id, uid),
          ),
        );
      } catch {
        // Leave unset — canEdit will fall back to authorship.
      }
    }

    return experiences.map((experience) => {
      const authorId = experienceAuthorId(experience);
      const primaryId = String(experience.itemId);
      const wineIds = (experience.wineItemIds ?? []).map((id) => String(id));
      const place = itemSummaries.get(primaryId);
      const wines = wineIds
        .map((id) => itemSummaries.get(id))
        .filter((wine): wine is NonNullable<typeof wine> => !!wine);

      const primaryAccess = primaryAccessById.get(primaryId) ?? access;
      const canEdit = canEditExperience(experience, userId, primaryAccess);

      return enrichExperience(mapExperience(experience), {
        companions: companionNamesByExperience.get(experience.id),
        authorDisplayName: authorId ? authorNames.get(authorId) : undefined,
        canEdit,
        place,
        wines,
      });
    });
  }

  private async resolveWineItemIds(
    userId: string,
    primaryItemId: string,
    wineItemIds?: string[],
  ): Promise<string[]> {
    const unique = [
      ...new Set(
        (wineItemIds ?? []).filter(
          (id) => id && id !== primaryItemId && Types.ObjectId.isValid(id),
        ),
      ),
    ];
    if (!unique.length) return [];

    const wines: string[] = [];
    for (const wineId of unique) {
      const item = await this.itemsService.getAccessibleItem(userId, wineId);
      if (item.category !== ItemCategory.Wine) {
        throw new BadRequestException(
          `Item ${wineId} is not a wine and cannot be linked to a visit`,
        );
      }
      wines.push(wineId);
    }
    return wines;
  }

  private async resolveParticipantUserIds(
    authorId: string,
    participantUserIds?: string[],
  ) {
    const unique = [
      ...new Set(
        (participantUserIds ?? []).filter((id) => id && id !== authorId),
      ),
    ];
    if (!unique.length) return [];

    const users = await this.usersService.findByIds(unique);
    if (users.length !== unique.length) {
      throw new BadRequestException('One or more participants were not found');
    }

    return toObjectIdArray(users.map((user) => user.id));
  }

  private async getExperienceOrThrow(experienceId: string) {
    const experience = await this.experienceModel.findById(experienceId).exec();
    if (!experience) throw new NotFoundException('Experience not found');
    return experience;
  }

  private parseCalendarDate(isoDate: string): Date {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private validatePhotoKeys(userId: string, keys: string[]) {
    for (const key of keys) {
      try {
        this.s3Service.assertUserKey(userId, key);
      } catch {
        throw new BadRequestException(`Invalid photo key: ${key}`);
      }
    }
  }

  private collectPhotoKeys(photos: { key: string; thumbKey?: string }[]): string[] {
    return photos.flatMap((photo) =>
      [photo.key, photo.thumbKey].filter((key): key is string => !!key),
    );
  }

  private async deletePhotoAssets(photo: { key: string; thumbKey?: string }) {
    for (const key of [photo.key, photo.thumbKey]) {
      if (!key) continue;
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // ignore missing objects
      }
    }
  }

  private validatePhotoKeysForUpdate(
    userId: string,
    experience: ExperienceDocument,
    photos: { key: string; thumbKey?: string }[],
  ) {
    const existingKeys = new Set(
      experience.photos.flatMap((photo) =>
        [photo.key, photo.thumbKey].filter((key): key is string => !!key),
      ),
    );
    for (const photo of photos) {
      if (existingKeys.has(photo.key)) continue;
      try {
        this.s3Service.assertUserKey(userId, photo.key);
      } catch {
        throw new BadRequestException(`Invalid photo key: ${photo.key}`);
      }
      if (photo.thumbKey && !existingKeys.has(photo.thumbKey)) {
        try {
          this.s3Service.assertUserKey(userId, photo.thumbKey);
        } catch {
          throw new BadRequestException(`Invalid photo key: ${photo.thumbKey}`);
        }
      }
    }
  }

  private async migrateLegacyExperiences() {
    const legacyAuthors = await this.experienceModel
      .find({ authorId: { $exists: false }, userId: { $exists: true } })
      .select('_id userId')
      .lean()
      .exec();

    for (const row of legacyAuthors) {
      const userId = (row as { userId?: Types.ObjectId }).userId;
      if (!userId) continue;
      await this.experienceModel.updateOne(
        { _id: row._id },
        { $set: { authorId: userId } },
      );
    }

    await this.experienceModel.deleteMany({
      authorId: { $exists: false },
      userId: { $exists: false },
    });

    await this.experienceModel.updateMany(
      { visibility: { $exists: false } },
      { $set: { visibility: ExperienceVisibility.Shared } },
    );
    await this.experienceModel.updateMany(
      { participantUserIds: { $exists: false } },
      { $set: { participantUserIds: [] } },
    );
    await this.experienceModel.updateMany(
      { companionPersonIds: { $exists: false } },
      { $set: { companionPersonIds: [] } },
    );
    await this.experienceModel.updateMany(
      { wineItemIds: { $exists: false } },
      { $set: { wineItemIds: [] } },
    );

    const legacyCompanionRows = await this.experienceModel
      .find({
        companions: { $exists: true, $not: { $size: 0 } },
        $or: [
          { companionPersonIds: { $exists: false } },
          { companionPersonIds: { $size: 0 } },
        ],
      })
      .lean()
      .exec();

    for (const row of legacyCompanionRows) {
      const authorId = row.authorId ?? (row as { userId?: Types.ObjectId }).userId;
      const companions = (row as { companions?: string[] }).companions;
      if (!authorId || !companions?.length) continue;

      try {
        const people = await Promise.all(
          companions.map((name) =>
            this.peopleService.findOrCreate(String(authorId), name),
          ),
        );
        await this.experienceModel.updateOne(
          { _id: row._id },
          {
            $set: {
              companionPersonIds: people.map((person) => person._id),
            },
            $unset: { companions: 1 },
          },
        );
      } catch (error) {
        console.warn(
          `Skipping companion migration for experience ${String(row._id)}:`,
          error,
        );
      }
    }

    const stringCompanionIds = await this.experienceModel
      .find({ companionPersonIds: { $elemMatch: { $type: 'string' } } })
      .lean()
      .exec();

    for (const row of stringCompanionIds) {
      const ids = (row.companionPersonIds ?? [])
        .map((id) => {
          try {
            return new Types.ObjectId(String(id));
          } catch {
            return null;
          }
        })
        .filter((id): id is Types.ObjectId => id != null);

      await this.experienceModel.updateOne(
        { _id: row._id },
        { $set: { companionPersonIds: ids } },
      );
    }

    await this.experienceModel.updateMany(
      { userId: { $exists: true } },
      { $unset: { userId: 1 } },
    );
    await this.experienceModel.updateMany(
      { companions: { $exists: true } },
      { $unset: { companions: 1 } },
    );

    const objectIdRows = await this.experienceModel.find().lean().exec();
    for (const row of objectIdRows) {
      const updates: Record<string, Types.ObjectId> = {};
      if (row.itemId != null && !(row.itemId instanceof Types.ObjectId)) {
        try {
          updates.itemId = new Types.ObjectId(String(row.itemId));
        } catch {
          // skip invalid legacy itemId
        }
      }
      if (row.authorId != null && !(row.authorId instanceof Types.ObjectId)) {
        try {
          updates.authorId = new Types.ObjectId(String(row.authorId));
        } catch {
          // skip invalid legacy authorId
        }
      }
      if (Object.keys(updates).length) {
        await this.experienceModel.updateOne(
          { _id: row._id },
          { $set: updates },
        );
      }
    }
  }
}
