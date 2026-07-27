import { ExperienceVisibility, SharePermission } from '@org/domain';
import { Types } from 'mongoose';
import { ExperienceDocument } from './experience.schema.js';
import { ItemDocument } from '../items/item.schema.js';

export type ItemAccess = {
  item: ItemDocument;
  isOwner: boolean;
  permission: 'owner' | SharePermission | null;
};

export function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

export function toObjectIdArray(
  values: Array<string | Types.ObjectId>,
): Types.ObjectId[] {
  return values.map((value) => toObjectId(value));
}

export function experienceAuthorId(
  experience: ExperienceDocument | { authorId?: Types.ObjectId; userId?: Types.ObjectId },
): string | undefined {
  if (experience.authorId) return String(experience.authorId);
  const legacyUserId = (experience as { userId?: Types.ObjectId }).userId;
  return legacyUserId ? String(legacyUserId) : undefined;
}

export function itemIdQuery(itemId: string) {
  return {
    $or: [{ itemId: toObjectId(itemId) }, { itemId }],
  };
}

export function canViewExperience(
  experience: ExperienceDocument,
  userId: string,
  access: ItemAccess,
): boolean {
  const uid = String(userId);
  const authorId = experienceAuthorId(experience);
  if (authorId === uid) return true;
  if (access.isOwner) return true;
  if (experience.participantUserIds?.some((id) => String(id) === uid)) {
    return true;
  }
  const visibility = experience.visibility ?? ExperienceVisibility.Shared;
  if (visibility !== ExperienceVisibility.Shared) return false;
  return (
    access.permission === 'owner' ||
    access.permission === SharePermission.View ||
    access.permission === SharePermission.Edit
  );
}

export function canEditExperience(
  experience: ExperienceDocument,
  userId: string,
  access: ItemAccess,
): boolean {
  const uid = String(userId);
  const authorId = experienceAuthorId(experience);
  if (authorId === uid) return true;
  return access.isOwner;
}

export function canCreateExperience(access: ItemAccess): boolean {
  return access.isOwner || access.permission === SharePermission.Edit;
}

export function canDeleteExperience(
  experience: ExperienceDocument,
  userId: string,
  access: ItemAccess,
): boolean {
  return canEditExperience(experience, userId, access);
}

export async function resolveItemAccess(
  userId: string,
  item: ItemDocument,
  findShare: (
    itemId: string,
    userId: string,
  ) => Promise<{ permission: SharePermission } | null>,
): Promise<ItemAccess> {
  const isOwner = String(item.ownerId) === userId;
  const share = isOwner ? null : await findShare(item.id, userId);
  return {
    item,
    isOwner,
    permission: isOwner ? 'owner' : (share?.permission ?? null),
  };
}
