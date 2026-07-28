import { PersonType, SourceType } from './enums.js';

export function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function personNameKey(name: string): string {
  return normalizePersonName(name).toLowerCase();
}

/** Lowercase + accent folding for fuzzy person-name matching. */
export function foldPersonName(name: string): string {
  return personNameKey(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const SIMILAR_NAME_THRESHOLD = 0.65;

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

/** Score from 0 (unrelated) to 1 (same person name). */
export function personNameSimilarity(a: string, b: string): number {
  const left = foldPersonName(a);
  const right = foldPersonName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;

  if (longer.startsWith(shorter)) {
    return 0.85 + (shorter.length / longer.length) * 0.1;
  }
  if (longer.includes(shorter)) {
    return 0.75 + (shorter.length / longer.length) * 0.1;
  }

  const distance = levenshteinDistance(left, right);
  const maxLen = Math.max(left.length, right.length);
  return Math.max(0, 1 - distance / maxLen);
}

export function isSimilarPersonName(a: string, b: string): boolean {
  return personNameSimilarity(a, b) >= SIMILAR_NAME_THRESHOLD;
}

export interface PersonNameCandidate {
  name: string;
}

export function rankSimilarPersonNames<T extends PersonNameCandidate>(
  query: string,
  candidates: T[],
  limit = 5,
): T[] {
  const normalized = normalizePersonName(query);
  if (!normalized) return [];

  const queryKey = foldPersonName(normalized);
  return candidates
    .map((candidate) => ({
      candidate,
      score: personNameSimilarity(normalized, candidate.name),
      exact: foldPersonName(candidate.name) === queryKey,
    }))
    .filter((entry) => entry.exact || entry.score >= SIMILAR_NAME_THRESHOLD)
    .sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function personTypeFromSourceType(sourceType: SourceType): PersonType {
  if (sourceType === SourceType.Friend) return PersonType.Friend;
  if (sourceType === SourceType.Family) return PersonType.Family;
  return PersonType.Other;
}
