import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Item, ItemDocument } from '../items/item.schema.js';
import {
  Experience,
  ExperienceDocument,
} from '../experiences/experience.schema.js';
import { SharingService } from '../sharing/sharing.service.js';
import { RecommendationsQueryDto } from './dto/recommendations.dto.js';
import { ItemStatus } from '@org/domain';
import { mapItem } from '../common/mappers.js';

export interface RecommendationResult {
  item: ReturnType<typeof mapItem>;
  score: number;
  distanceKm?: number;
  latestOverallRating?: number;
  matchReasons: string[];
}

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    private readonly sharingService: SharingService,
  ) {}

  async suggest(
    userId: string,
    query: RecommendationsQueryDto,
  ): Promise<RecommendationResult[]> {
    const sharedIds = await this.sharingService.findAccessibleItemIds(userId);
    const filter: Record<string, unknown> = {
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        ...(sharedIds.length
          ? [{ _id: { $in: sharedIds.map((id) => new Types.ObjectId(id)) } }]
          : []),
      ],
      status: { $ne: ItemStatus.Rejected },
    };

    if (query.status) filter['status'] = query.status;
    if (query.category) filter['category'] = query.category;

    const tagList = query.tags
      ?.split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tagList?.length) {
      filter['tags'] = { $in: tagList };
    }

    const items = await this.itemModel.find(filter).exec();
    if (!items.length) return [];

    const itemIds = items.map((i) => i._id);
    const experiences = await this.experienceModel
      .find({ itemId: { $in: itemIds }, userId: new Types.ObjectId(userId) })
      .sort({ visitedAt: -1 })
      .exec();

    const latestByItem = new Map<string, ExperienceDocument>();
    for (const exp of experiences) {
      const key = String(exp.itemId);
      if (!latestByItem.has(key)) latestByItem.set(key, exp);
    }

    const radiusKm = query.radiusKm ?? 15;
    const limit = query.limit ?? 10;
    const now = Date.now();
    const results: RecommendationResult[] = [];

    for (const doc of items) {
      const item = mapItem(doc);
      const latest = latestByItem.get(item.id);
      const latestRating = latest?.rating?.overall;
      const matchReasons: string[] = [];
      let score = 0;

      if (item.status === ItemStatus.Favorite) {
        score += 3;
        matchReasons.push('Favorite');
      } else if (item.status === ItemStatus.Wishlist) {
        score += 1.5;
        matchReasons.push('On your wishlist');
      } else if (item.status === ItemStatus.Visited) {
        score += 1;
      }

      if (latestRating != null) {
        score += latestRating * 0.5;
        if (query.minOverallRating != null && latestRating < query.minOverallRating) {
          continue;
        }
        if (latestRating >= 8) matchReasons.push('Highly rated by you');
      } else if (query.minOverallRating != null) {
        continue;
      }

      if (latest?.wouldReturn === true) {
        score += 2;
        matchReasons.push('You would return');
      }

      if (tagList?.length) {
        const itemTags = item.tags.map((t) => t.toLowerCase());
        const matched = tagList.filter((t) => itemTags.includes(t));
        if (matched.length) {
          score += matched.length * 1.5;
          matchReasons.push(`Matches: ${matched.join(', ')}`);
        }
      }

      if (query.excludeVisitedWithinDays != null && latest) {
        const daysSince =
          (now - new Date(latest.visitedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < query.excludeVisitedWithinDays) {
          score -= 3;
        } else {
          matchReasons.push('Not visited recently');
        }
      }

      let distanceKm: number | undefined;
      const lat = item.location?.latitude;
      const lng = item.location?.longitude;
      if (
        query.latitude != null &&
        query.longitude != null &&
        lat != null &&
        lng != null
      ) {
        distanceKm = haversineKm(query.latitude, query.longitude, lat, lng);
        if (distanceKm > radiusKm) continue;
        score += Math.max(0, 5 - distanceKm / (radiusKm / 5));
        matchReasons.push(`${distanceKm.toFixed(1)} km away`);
      }

      if (item.source?.referrerName) {
        matchReasons.push(`Via ${item.source.referrerName}`);
      }

      results.push({
        item,
        score,
        distanceKm,
        latestOverallRating: latestRating,
        matchReasons: [...new Set(matchReasons)],
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
