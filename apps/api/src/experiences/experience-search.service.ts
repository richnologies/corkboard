import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Experience } from '@org/domain';
import {
  Experience as ExperienceDocumentModel,
  ExperienceDocument,
} from './experience.schema.js';
import { SharingService } from '../sharing/sharing.service.js';
import { ItemsService } from '../items/items.service.js';
import { OpenAiService } from '../openai/openai.service.js';
import { ExperiencesService } from './experiences.service.js';
import {
  canViewExperience,
  experienceAuthorId,
  resolveItemAccess,
} from './experience-access.js';
import {
  cosineSimilarity,
  mergeHybridRankings,
  sanitizeTextQuery,
} from './hybrid-search.js';

export interface ExperienceSearchHit {
  experience: Experience;
  itemName?: string;
  snippet?: string;
  score: number;
}

@Injectable()
export class ExperienceSearchService {
  constructor(
    @InjectModel(ExperienceDocumentModel.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    private readonly sharingService: SharingService,
    @Inject(forwardRef(() => ItemsService))
    private readonly itemsService: ItemsService,
    private readonly openai: OpenAiService,
    @Inject(forwardRef(() => ExperiencesService))
    private readonly experiencesService: ExperiencesService,
  ) {}

  async search(
    userId: string,
    query: string,
    limit = 8,
  ): Promise<ExperienceSearchHit[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const candidates = await this.loadCandidates(userId);
    if (!candidates.length) return [];

    const keywordRanked = await this.keywordSearch(userId, trimmed, candidates);
    const vectorRanked = await this.vectorSearch(trimmed, candidates);
    const merged = mergeHybridRankings(keywordRanked, vectorRanked).slice(
      0,
      limit,
    );

    const experiences = await this.experiencesService.enrichSearchResults(
      userId,
      merged,
    );

    return experiences.map((experience, index) => ({
      experience,
      itemName: merged[index]?.itemName,
      snippet: this.buildSnippet(merged[index]?.searchText, trimmed),
      score: experiences.length - index,
    }));
  }

  private async keywordSearch(
    userId: string,
    query: string,
    candidates: ExperienceDocument[],
  ) {
    const sanitized = sanitizeTextQuery(query);
    if (!sanitized) return this.fallbackKeywordSearch(query, candidates);

    const accessFilter = this.accessFilter(userId);
    try {
      const docs = await this.experienceModel
        .find(
          {
            $and: [
              accessFilter,
              { searchIndexedAt: { $exists: true } },
              { $text: { $search: sanitized } },
            ],
          },
          { score: { $meta: 'textScore' } },
        )
        .sort({ score: { $meta: 'textScore' } })
        .limit(30)
        .exec();
      if (docs.length) return docs;
    } catch {
      // Text index may not exist yet on older databases.
    }

    return this.fallbackKeywordSearch(query, candidates);
  }

  private fallbackKeywordSearch(
    query: string,
    candidates: ExperienceDocument[],
  ) {
    const terms = sanitizeTextQuery(query)
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length >= 2);
    if (!terms.length) return [];

    return candidates
      .map((doc) => {
        const haystack = (doc.searchText ?? '').toLowerCase();
        const hits = terms.filter((term) => haystack.includes(term)).length;
        return { doc, hits };
      })
      .filter((row) => row.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((row) => row.doc);
  }

  private async vectorSearch(query: string, candidates: ExperienceDocument[]) {
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await this.openai.embed(query);
    } catch {
      return [];
    }
    if (!queryEmbedding.length) return [];

    return candidates
      .filter((doc) => doc.searchEmbedding?.length)
      .map((doc) => ({
        doc,
        score: cosineSimilarity(queryEmbedding, doc.searchEmbedding!),
      }))
      .filter((row) => row.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((row) => row.doc);
  }

  private async loadCandidates(userId: string) {
    const sharedItemIds =
      await this.sharingService.findAccessibleItemIds(userId);
    const uid = new Types.ObjectId(userId);

    const docs = await this.experienceModel
      .find({
        searchIndexedAt: { $exists: true },
        $or: [
          { authorId: uid },
          { participantUserIds: uid },
          ...(sharedItemIds.length
            ? [
                {
                  itemId: {
                    $in: sharedItemIds.map((id) => new Types.ObjectId(id)),
                  },
                },
              ]
            : []),
        ],
      })
      .exec();

    const visible: ExperienceDocument[] = [];
    for (const doc of docs) {
      if (await this.canView(userId, doc)) visible.push(doc);
    }
    return visible;
  }

  private async canView(userId: string, experience: ExperienceDocument) {
    const authorId = experienceAuthorId(experience);
    if (authorId === userId) return true;
    if (experience.participantUserIds?.some((id) => String(id) === userId)) {
      return true;
    }

    try {
      const item = await this.itemsService.getAccessibleItem(
        userId,
        String(experience.itemId),
      );
      const access = await resolveItemAccess(userId, item, (id, uid) =>
        this.sharingService.findShare(id, uid),
      );
      return canViewExperience(experience, userId, access);
    } catch {
      return false;
    }
  }

  private accessFilter(userId: string) {
    const uid = new Types.ObjectId(userId);
    return {
      $or: [{ authorId: uid }, { participantUserIds: uid }],
    };
  }

  private buildSnippet(searchText: string | undefined, query: string) {
    if (!searchText) return undefined;
    const lower = searchText.toLowerCase();
    const term = sanitizeTextQuery(query).toLowerCase().split(/\s+/)[0];
    if (!term) return searchText.slice(0, 160);

    const index = lower.indexOf(term);
    if (index < 0) return searchText.slice(0, 160);

    const start = Math.max(0, index - 40);
    const end = Math.min(searchText.length, index + 120);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < searchText.length ? '…' : '';
    return `${prefix}${searchText.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
  }
}
