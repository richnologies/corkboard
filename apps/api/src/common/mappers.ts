import {
  Experience,
  Item,
  ItemHistory,
  ItemShare,
  LatestVisitSummary,
  StructuredRating,
} from '@org/domain';
import { ItemDocument } from '../items/item.schema.js';
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
    source: doc.source
      ? {
          type: doc.source.type,
          referrerName: doc.source.referrerName,
          referrerPersonId: doc.source.referrerPersonId
            ? String(doc.source.referrerPersonId)
            : undefined,
          url: doc.source.url,
          notes: doc.source.notes,
        }
      : undefined,
    rejectionReason: doc.rejectionReason ?? undefined,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapLatestVisitSummary(input: {
  visitedAt: Date;
  rating?: StructuredRating;
  notes?: string;
}): LatestVisitSummary {
  return {
    visitedAt: input.visitedAt.toISOString(),
    rating: input.rating,
    notes: input.notes,
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
  experiences: Experience[],
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
