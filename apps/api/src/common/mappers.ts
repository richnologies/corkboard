import {
  Experience,
  Experience as ExperienceEntity,
  ExperiencePhoto,
  Item,
  ItemHistory,
  ItemShare,
  StructuredRating,
} from '@org/domain';
import { ItemDocument } from '../items/item.schema.js';
import { ExperienceDocument } from '../experiences/experience.schema.js';
import { ItemShareDocument } from '../sharing/share.schema.js';

export function mapItem(doc: ItemDocument): Item {
  return {
    id: doc.id,
    ownerId: String(doc.ownerId),
    name: doc.name,
    category: doc.category,
    status: doc.status,
    location: doc.location ?? undefined,
    links: doc.links ?? [],
    photoKeys: doc.photoKeys ?? [],
    tags: doc.tags ?? [],
    source: doc.source ?? undefined,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapExperience(doc: ExperienceDocument): ExperienceEntity {
  return {
    id: doc.id,
    itemId: String(doc.itemId),
    userId: String(doc.userId),
    visitedAt: doc.visitedAt.toISOString(),
    rating: doc.rating as StructuredRating | undefined,
    notes: doc.notes,
    wouldReturn: doc.wouldReturn,
    companions: doc.companions?.length ? doc.companions : undefined,
    photos: doc.photos?.length
      ? (doc.photos.map((p) => ({
          key: p.key,
          notes: p.notes,
        })) satisfies ExperiencePhoto[])
      : undefined,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapShare(doc: ItemShareDocument): ItemShare {
  return {
    id: doc.id,
    itemId: String(doc.itemId),
    ownerId: String(doc.ownerId),
    sharedWithUserId: String(doc.sharedWithUserId),
    permission: doc.permission,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function buildItemHistory(
  item: Item,
  experiences: ExperienceEntity[],
): ItemHistory {
  const sorted = [...experiences].sort(
    (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
  );
  const latest = sorted[0];
  return {
    item,
    experiences: sorted,
    visitCount: experiences.length,
    latestExperience: latest,
    wouldReturn: latest?.wouldReturn,
  };
}
