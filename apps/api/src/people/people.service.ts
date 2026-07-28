import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PersonType,
  SourceType,
  foldPersonName,
  normalizePersonName,
  personNameKey,
  personTypeFromSourceType,
  rankSimilarPersonNames,
  Person as PersonEntity,
  CompanionNameResolution,
} from '@org/domain';
import { Item, ItemDocument } from '../items/item.schema.js';
import { Experience, ExperienceDocument } from '../experiences/experience.schema.js';
import { Person, PersonDocument } from './person.schema.js';
import {
  CreatePersonDto,
  PersonQueryDto,
  PersonSuggestQueryDto,
  UpdatePersonDto,
} from './dto/person.dto.js';
import { mapPerson } from './people.mapper.js';

export interface CompanionPrepareAmbiguity {
  query: string;
  candidates: PersonEntity[];
}

export type CompanionPrepareResult =
  | {
      ok: true;
      companionPersonIds: string[];
      companions: string[];
    }
  | {
      ok: false;
      ambiguities: CompanionPrepareAmbiguity[];
    };

export interface ResolvedSourceInput {
  type: SourceType;
  referrerName?: string;
  referrerPersonId?: string;
  url?: string;
  notes?: string;
}

@Injectable()
export class PeopleService implements OnModuleInit {
  constructor(
    @InjectModel(Person.name) private readonly personModel: Model<PersonDocument>,
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
  ) {}

  async onModuleInit() {
    await this.migrateLegacyReferrers();
  }

  async findAllForUser(userId: string, query?: PersonQueryDto) {
    const ownerId = new Types.ObjectId(userId);
    const filter: Record<string, unknown> = { ownerId };
    const q = query?.q?.trim();
    if (q) {
      filter.name = new RegExp(this.escapeRegex(q), 'i');
    }

    const people = await this.personModel
      .find(filter)
      .sort({ name: 1 })
      .exec();
    const stats = await this.loadUsageStats(
      userId,
      people.map((person) => person.id),
    );

    return people.map((person) =>
      mapPerson(person, stats.get(person.id) ?? { sourceCount: 0, visitCount: 0 }),
    );
  }

  async findById(userId: string, personId: string) {
    const person = await this.personModel.findById(personId).exec();
    if (!person || String(person.ownerId) !== userId) {
      throw new NotFoundException('Person not found');
    }
    const stats = await this.loadUsageStats(userId, [person.id]);
    return mapPerson(
      person,
      stats.get(person.id) ?? { sourceCount: 0, visitCount: 0 },
    );
  }

  async suggest(userId: string, name: string) {
    const normalized = normalizePersonName(name);
    if (!normalized) {
      return { exact: null, similar: [] };
    }

    const ownerId = new Types.ObjectId(userId);
    const exactDoc = await this.personModel
      .findOne({ ownerId, nameKey: personNameKey(normalized) })
      .exec();

    const people = await this.personModel.find({ ownerId }).sort({ name: 1 }).exec();
    const stats = await this.loadUsageStats(
      userId,
      people.map((person) => person.id),
    );
    const mapped = people.map((person) =>
      mapPerson(person, stats.get(person.id) ?? { sourceCount: 0, visitCount: 0 }),
    );

    const similar = rankSimilarPersonNames(normalized, mapped).filter(
      (person) => person.id !== exactDoc?.id,
    );

    return {
      exact: exactDoc
        ? mapPerson(
            exactDoc,
            stats.get(exactDoc.id) ?? { sourceCount: 0, visitCount: 0 },
          )
        : null,
      similar,
    };
  }

  async getActivity(userId: string, personId: string) {
    const person = await this.personModel.findById(personId).exec();
    if (!person || String(person.ownerId) !== userId) {
      throw new NotFoundException('Person not found');
    }

    const ownerId = new Types.ObjectId(userId);
    const personObjectId = person._id;

    const items = await this.itemModel
      .find({ ownerId, 'source.referrerPersonId': personObjectId })
      .sort({ name: 1 })
      .select({ name: 1, category: 1, status: 1 })
      .exec();

    const experiences = await this.experienceModel
      .find({ authorId: ownerId, companionPersonIds: personObjectId })
      .sort({ visitedAt: -1 })
      .select({ itemId: 1, visitedAt: 1, rating: 1 })
      .exec();

    const itemIds = [...new Set(experiences.map((exp) => String(exp.itemId)))];
    const itemDocs = itemIds.length
      ? await this.itemModel
          .find({ _id: { $in: itemIds.map((id) => new Types.ObjectId(id)) } })
          .select({ name: 1 })
          .exec()
      : [];
    const itemNames = new Map(itemDocs.map((item) => [item.id, item.name]));

    return {
      recommendations: items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        status: item.status,
      })),
      visits: experiences.map((exp) => ({
        id: exp.id,
        itemId: String(exp.itemId),
        itemName: itemNames.get(String(exp.itemId)) ?? '',
        visitedAt: exp.visitedAt.toISOString(),
        rating: exp.rating,
      })),
    };
  }

  async findByIds(userId: string, personIds: string[]) {
    if (!personIds.length) return [];
    const people = await this.personModel
      .find({
        _id: { $in: personIds.map((id) => new Types.ObjectId(id)) },
        ownerId: new Types.ObjectId(userId),
      })
      .exec();
    const byId = new Map(people.map((person) => [person.id, person]));
    return personIds
      .map((id) => byId.get(id))
      .filter((person): person is PersonDocument => person != null);
  }

  async create(userId: string, dto: CreatePersonDto) {
    const name = normalizePersonName(dto.name);
    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const existing = await this.personModel
      .findOne({ ownerId: new Types.ObjectId(userId), nameKey: personNameKey(name) })
      .exec();
    if (existing) {
      const stats = await this.loadUsageStats(userId, [existing.id]);
      return mapPerson(
        existing,
        stats.get(existing.id) ?? { sourceCount: 0, visitCount: 0 },
      );
    }

    const person = await this.personModel.create({
      ownerId: new Types.ObjectId(userId),
      name,
      nameKey: personNameKey(name),
      type: dto.type,
    });
    return mapPerson(person, { sourceCount: 0, visitCount: 0 });
  }

  async update(userId: string, personId: string, dto: UpdatePersonDto) {
    const person = await this.personModel.findById(personId).exec();
    if (!person || String(person.ownerId) !== userId) {
      throw new NotFoundException('Person not found');
    }

    if (dto.name !== undefined) {
      const name = normalizePersonName(dto.name);
      if (!name) {
        throw new BadRequestException('Name is required');
      }
      const duplicate = await this.personModel
        .findOne({
          ownerId: person.ownerId,
          nameKey: personNameKey(name),
          _id: { $ne: person._id },
        })
        .exec();
      if (duplicate) {
        throw new BadRequestException('A person with this name already exists');
      }
      person.name = name;
      person.nameKey = personNameKey(name);
      await this.syncDenormalizedNames(userId, person.id, name);
    }

    if (dto.type !== undefined) {
      person.type = dto.type;
    }

    if (dto.linkedUserId !== undefined) {
      person.linkedUserId = dto.linkedUserId
        ? new Types.ObjectId(dto.linkedUserId)
        : undefined;
    }

    await person.save();
    const stats = await this.loadUsageStats(userId, [person.id]);
    return mapPerson(
      person,
      stats.get(person.id) ?? { sourceCount: 0, visitCount: 0 },
    );
  }

  async remove(userId: string, personId: string) {
    const person = await this.personModel.findById(personId).exec();
    if (!person || String(person.ownerId) !== userId) {
      throw new NotFoundException('Person not found');
    }

    await this.itemModel.updateMany(
      { ownerId: person.ownerId, 'source.referrerPersonId': person._id },
      { $unset: { 'source.referrerPersonId': 1 } },
    );
    await this.experienceModel.updateMany(
      { authorId: person.ownerId, companionPersonIds: person._id },
      { $pull: { companionPersonIds: person._id } },
    );
    await this.personModel.findByIdAndDelete(personId).exec();
  }

  async findOrCreate(
    userId: string,
    name: string,
    type: PersonType = PersonType.Other,
  ) {
    const normalized = normalizePersonName(name);
    if (!normalized) {
      throw new BadRequestException('Name is required');
    }

    const existing = await this.personModel
      .findOne({
        ownerId: new Types.ObjectId(userId),
        nameKey: personNameKey(normalized),
      })
      .exec();
    if (existing) return existing;

    return this.personModel.create({
      ownerId: new Types.ObjectId(userId),
      name: normalized,
      nameKey: personNameKey(normalized),
      type,
    });
  }

  async prepareCompanions(
    userId: string,
    names: string[],
    resolutions: CompanionNameResolution[] = [],
  ): Promise<CompanionPrepareResult> {
    if (!names.length) {
      return { ok: true, companionPersonIds: [], companions: [] };
    }

    const resolutionByKey = new Map(
      resolutions.map((resolution) => [
        foldPersonName(resolution.query),
        resolution,
      ]),
    );

    const people = await this.findAllForUser(userId);
    const companionPersonIds: string[] = [];
    const companions: string[] = [];
    const ambiguities: CompanionPrepareAmbiguity[] = [];

    for (const rawName of names) {
      const name = normalizePersonName(rawName);
      if (!name) continue;

      const resolution = resolutionByKey.get(foldPersonName(name));
      if (resolution?.personId) {
        const [person] = await this.findByIds(userId, [resolution.personId]);
        if (!person) {
          throw new BadRequestException(`Companion "${name}" was not found`);
        }
        companionPersonIds.push(person.id);
        companions.push(person.name);
        continue;
      }
      if (resolution?.createNew) {
        const person = await this.findOrCreate(userId, name);
        companionPersonIds.push(person.id);
        companions.push(person.name);
        continue;
      }

      const nameKey = personNameKey(name);
      const exact = people.find((person) => personNameKey(person.name) === nameKey);
      if (exact) {
        companionPersonIds.push(exact.id);
        companions.push(exact.name);
        continue;
      }

      const similar = rankSimilarPersonNames(name, people);
      if (similar.length) {
        ambiguities.push({ query: name, candidates: similar });
        continue;
      }

      const person = await this.findOrCreate(userId, name);
      companionPersonIds.push(person.id);
      companions.push(person.name);
    }

    if (ambiguities.length) {
      return { ok: false, ambiguities };
    }

    return { ok: true, companionPersonIds, companions };
  }

  async resolveSourceForWrite(
    userId: string,
    source?: ResolvedSourceInput,
  ): Promise<ResolvedSourceInput | undefined> {
    if (!source) return undefined;

    if (source.referrerPersonId) {
      const [person] = await this.findByIds(userId, [source.referrerPersonId]);
      if (!person) {
        throw new BadRequestException('Referrer person not found');
      }
      return {
        ...source,
        referrerPersonId: person.id,
        referrerName: person.name,
      };
    }

    if (source.referrerName?.trim()) {
      const person = await this.findOrCreate(
        userId,
        source.referrerName,
        personTypeFromSourceType(source.type),
      );
      return {
        ...source,
        referrerPersonId: person.id,
        referrerName: person.name,
      };
    }

    return {
      ...source,
      referrerPersonId: undefined,
      referrerName: undefined,
    };
  }

  async resolveCompanionsForWrite(
    userId: string,
    input: { companionPersonIds?: string[]; companions?: string[] },
  ) {
    if (input.companionPersonIds?.length) {
      const people = await this.findByIds(userId, input.companionPersonIds);
      if (people.length !== input.companionPersonIds.length) {
        throw new BadRequestException('One or more companions were not found');
      }
      const byId = new Map(people.map((person) => [person.id, person]));
      const ordered = input.companionPersonIds
        .map((id) => byId.get(id))
        .filter((person): person is PersonDocument => person != null);
      return {
        companionPersonIds: ordered.map((person) => person.id),
        companions: ordered.map((person) => person.name),
      };
    }

    if (input.companions?.length) {
      const people = await Promise.all(
        input.companions.map((name) => this.findOrCreate(userId, name)),
      );
      return {
        companionPersonIds: people.map((person) => person.id),
        companions: people.map((person) => person.name),
      };
    }

    return { companionPersonIds: [], companions: [] };
  }

  private async loadUsageStats(userId: string, personIds: string[]) {
    const stats = new Map<string, { sourceCount: number; visitCount: number }>();
    if (!personIds.length) return stats;

    const objectIds = personIds.map((id) => new Types.ObjectId(id));
    const ownerId = new Types.ObjectId(userId);

    const sourceRows = await this.itemModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            ownerId,
            'source.referrerPersonId': { $in: objectIds },
          },
        },
        { $group: { _id: '$source.referrerPersonId', count: { $sum: 1 } } },
      ])
      .exec();

    const visitRows = await this.experienceModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { authorId: ownerId, companionPersonIds: { $in: objectIds } } },
        { $unwind: '$companionPersonIds' },
        { $match: { companionPersonIds: { $in: objectIds } } },
        { $group: { _id: '$companionPersonIds', count: { $sum: 1 } } },
      ])
      .exec();

    for (const id of personIds) {
      stats.set(id, { sourceCount: 0, visitCount: 0 });
    }
    for (const row of sourceRows) {
      const current = stats.get(String(row._id));
      if (current) current.sourceCount = row.count;
    }
    for (const row of visitRows) {
      const current = stats.get(String(row._id));
      if (current) current.visitCount = row.count;
    }

    return stats;
  }

  private async syncDenormalizedNames(
    userId: string,
    personId: string,
    name: string,
  ) {
    const objectId = new Types.ObjectId(personId);
    await this.itemModel.updateMany(
      { ownerId: new Types.ObjectId(userId), 'source.referrerPersonId': objectId },
      { $set: { 'source.referrerName': name } },
    );
  }

  private async migrateLegacyReferrers() {
    const items = await this.itemModel
      .find({
        'source.referrerName': { $exists: true, $nin: [null, ''] },
        'source.referrerPersonId': { $exists: false },
      })
      .exec();

    for (const item of items) {
      const source = item.source;
      if (!source?.referrerName) continue;
      const person = await this.findOrCreate(
        String(item.ownerId),
        source.referrerName,
        personTypeFromSourceType(source.type),
      );
      source.referrerPersonId = person._id;
      source.referrerName = person.name;
      await item.save();
    }
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
