import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { formatLocationSummary } from '@org/domain';
import { Experience, ExperienceDocument } from './experience.schema.js';
import { ItemsService } from '../items/items.service.js';
import { PeopleService } from '../people/people.service.js';
import { S3Service } from '../storage/s3.service.js';
import { OpenAiService } from '../openai/openai.service.js';
import { experienceAuthorId } from './experience-access.js';

@Injectable()
export class ExperienceSearchIndexService implements OnModuleInit {
  private readonly logger = new Logger(ExperienceSearchIndexService.name);
  private backfillRunning = false;

  constructor(
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    @Inject(forwardRef(() => ItemsService))
    private readonly itemsService: ItemsService,
    private readonly peopleService: PeopleService,
    private readonly s3Service: S3Service,
    private readonly openai: OpenAiService,
  ) {}

  onModuleInit() {
    void this.backfillMissingIndexes();
  }

  scheduleIndex(experienceId: string) {
    void this.indexExperience(experienceId).catch((error) => {
      this.logger.warn(
        `Failed to index experience ${experienceId}: ${error instanceof Error ? error.message : error}`,
      );
    });
  }

  async indexExperience(experienceId: string): Promise<void> {
    const experience = await this.experienceModel.findById(experienceId).exec();
    if (!experience) return;

    const authorId = experienceAuthorId(experience);
    if (!authorId) return;

    const item = await this.itemsService.getAccessibleItem(
      authorId,
      String(experience.itemId),
    );

    const companionIds = (experience.companionPersonIds ?? []).map((id) =>
      String(id),
    );
    const people = companionIds.length
      ? await this.peopleService.findByIds(authorId, companionIds)
      : [];
    const companionNames = people.map((person) => person.name);

    const wineIds = (experience.wineItemIds ?? []).map((id) => String(id));
    const wineSummaries = wineIds.length
      ? await this.itemsService.findSummariesByIds(wineIds)
      : new Map();
    const wineNames = wineIds
      .map((id) => wineSummaries.get(id)?.name)
      .filter((name): name is string => !!name);

    const photos = [...(experience.photos ?? [])];
    for (const photo of photos) {
      if (photo.notes?.trim() || photo.aiDescription?.trim()) continue;
      const imageKey = photo.thumbKey ?? photo.key;
      try {
        const imageUrl = await this.s3Service.createViewUrl(imageKey);
        photo.aiDescription = await this.openai.describeVisitPhoto(imageUrl);
      } catch (error) {
        this.logger.warn(
          `Photo description failed for ${imageKey}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const searchText = this.buildSearchText({
      itemName: item.name,
      wineNames,
      location: formatLocationSummary(item.location),
      visitedAt: experience.visitedAt,
      notes: experience.notes,
      wouldReturn: experience.wouldReturn,
      rating: experience.rating,
      companions: companionNames,
      photos,
    });

    let searchEmbedding: number[] | undefined;
    try {
      const embedding = await this.openai.embed(searchText);
      if (embedding.length) searchEmbedding = embedding;
    } catch (error) {
      this.logger.warn(
        `Embedding failed for experience ${experienceId}: ${error instanceof Error ? error.message : error}`,
      );
    }

    experience.itemName = item.name;
    experience.photos = photos;
    experience.searchText = searchText;
    experience.searchEmbedding = searchEmbedding;
    experience.searchIndexedAt = new Date();
    await experience.save();
  }

  private buildSearchText(input: {
    itemName: string;
    wineNames?: string[];
    location?: string;
    visitedAt: Date;
    notes?: string;
    wouldReturn?: boolean;
    rating?: Experience['rating'];
    companions: string[];
    photos: { notes?: string; aiDescription?: string }[];
  }): string {
    const lines = [
      `Place: ${input.itemName}`,
      ...(input.wineNames?.length
        ? [`Wines: ${input.wineNames.join(', ')}`]
        : []),
      ...(input.location ? [`Location: ${input.location}`] : []),
      `Visited: ${input.visitedAt.toISOString().slice(0, 10)}`,
    ];

    if (input.companions.length) {
      lines.push(`Companions: ${input.companions.join(', ')}`);
    }

    if (input.rating) {
      const parts = [
        input.rating.food != null ? `food ${input.rating.food}` : null,
        input.rating.service != null ? `service ${input.rating.service}` : null,
        input.rating.atmosphere != null
          ? `atmosphere ${input.rating.atmosphere}`
          : null,
        input.rating.valueForMoney != null
          ? `value ${input.rating.valueForMoney}`
          : null,
        input.rating.overall != null ? `overall ${input.rating.overall}` : null,
      ].filter(Boolean);
      if (parts.length) lines.push(`Ratings: ${parts.join(', ')}`);
    }

    if (input.notes?.trim()) {
      lines.push(`Notes: ${input.notes.trim()}`);
    }

    if (input.wouldReturn != null) {
      lines.push(`Would return: ${input.wouldReturn ? 'yes' : 'no'}`);
    }

    for (const photo of input.photos) {
      const text = photo.notes?.trim() || photo.aiDescription?.trim();
      if (text) lines.push(`Photo: ${text}`);
    }

    return lines.join('\n');
  }

  private async backfillMissingIndexes() {
    if (this.backfillRunning) return;
    this.backfillRunning = true;

    try {
      this.openai.assertConfigured();
    } catch {
      this.logger.log('Skipping experience search backfill — OpenAI not configured');
      return;
    }

    const batchSize = 3;
    for (;;) {
      const pending = await this.experienceModel
        .find({ searchIndexedAt: { $exists: false } })
        .select('_id')
        .limit(batchSize)
        .exec();

      if (!pending.length) break;

      for (const experience of pending) {
        try {
          await this.indexExperience(experience.id);
        } catch (error) {
          this.logger.warn(
            `Backfill failed for ${experience.id}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    this.backfillRunning = false;
  }
}
