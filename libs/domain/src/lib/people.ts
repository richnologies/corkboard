import { PersonType, SourceType } from './enums.js';

export function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function personNameKey(name: string): string {
  return normalizePersonName(name).toLowerCase();
}

export function personTypeFromSourceType(sourceType: SourceType): PersonType {
  if (sourceType === SourceType.Friend) return PersonType.Friend;
  if (sourceType === SourceType.Family) return PersonType.Family;
  return PersonType.Other;
}
