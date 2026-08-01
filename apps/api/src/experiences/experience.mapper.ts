import {
  Experience,
  Experience as ExperienceEntity,
  ExperiencePhoto,
  ExperienceVisibility,
  StructuredRating,
} from '@org/domain';
import { ExperienceDocument } from '../experiences/experience.schema.js';
import { experienceAuthorId } from '../experiences/experience-access.js';

export function mapExperience(doc: ExperienceDocument): ExperienceEntity {
  const authorId = experienceAuthorId(doc);
  return {
    id: doc.id,
    itemId: String(doc.itemId),
    authorId: authorId ?? '',
    visibility: doc.visibility ?? ExperienceVisibility.Shared,
    participantUserIds: (doc.participantUserIds ?? []).map((id) => String(id)),
    visitedAt: doc.visitedAt.toISOString(),
    rating: doc.rating as StructuredRating | undefined,
    notes: doc.notes,
    wouldReturn: doc.wouldReturn,
    companionPersonIds: (doc.companionPersonIds ?? []).map((id) => String(id)),
    wineItemIds: (doc.wineItemIds ?? []).map((id) => String(id)),
    photos: doc.photos?.length
      ? (doc.photos.map((p) => ({
          key: p.key,
          thumbKey: p.thumbKey,
          notes: p.notes,
          aiDescription: p.aiDescription,
        })) satisfies ExperiencePhoto[])
      : undefined,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function enrichExperience(
  experience: Experience,
  extras: {
    companions?: string[];
    authorDisplayName?: string;
    canEdit?: boolean;
    place?: Experience['place'];
    wines?: Experience['wines'];
  },
): Experience {
  return {
    ...experience,
    companions: extras.companions?.length ? extras.companions : undefined,
    authorDisplayName: extras.authorDisplayName,
    canEdit: extras.canEdit,
    place: extras.place,
    wines: extras.wines?.length ? extras.wines : undefined,
  };
}
