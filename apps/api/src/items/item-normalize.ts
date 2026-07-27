import {
  ItemStatus,
  addFavoriteTag,
  normalizeTag,
} from '@org/domain';

const LEGACY_FAVORITE_STATUS = 'favorite';

export interface ItemWriteInput {
  status?: ItemStatus;
  tags?: string[];
  rejectionReason?: string;
}

export interface PreparedItemWrite extends ItemWriteInput {
  unsetRejectionReason?: boolean;
}

export function prepareItemWrite(
  dto: ItemWriteInput,
  existing?: { status?: ItemStatus; tags?: string[] },
): PreparedItemWrite {
  const prepared: PreparedItemWrite = { ...dto };

  if ((prepared.status as string | undefined) === LEGACY_FAVORITE_STATUS) {
    prepared.status = ItemStatus.Visited;
    prepared.tags = addFavoriteTag(prepared.tags ?? existing?.tags ?? []);
  }

  if (prepared.tags) {
    prepared.tags = [
      ...new Set(prepared.tags.map(normalizeTag).filter(Boolean)),
    ];
  }

  const status = prepared.status ?? existing?.status;
  if (status === ItemStatus.Rejected) {
    if (prepared.rejectionReason !== undefined) {
      prepared.rejectionReason = prepared.rejectionReason.trim() || undefined;
    }
  } else if (
    prepared.status != null &&
    prepared.status !== ItemStatus.Rejected
  ) {
    prepared.rejectionReason = undefined;
    prepared.unsetRejectionReason = true;
  }

  return prepared;
}

export function migrateLegacyFavoriteItem(item: {
  status: string;
  tags?: string[];
}): { status: ItemStatus; tags: string[] } | null {
  if (item.status !== LEGACY_FAVORITE_STATUS) return null;
  return {
    status: ItemStatus.Visited,
    tags: addFavoriteTag(item.tags ?? []),
  };
}
