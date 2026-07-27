export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function sanitizeTextQuery(query: string): string {
  return query
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reciprocal rank fusion for hybrid search. */
export function mergeHybridRankings<T extends { id: string }>(
  keywordRanked: T[],
  vectorRanked: T[],
  k = 60,
): T[] {
  const scores = new Map<string, number>();
  const items = new Map<string, T>();

  keywordRanked.forEach((item, index) => {
    items.set(item.id, item);
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + index + 1));
  });
  vectorRanked.forEach((item, index) => {
    items.set(item.id, item);
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + index + 1));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => items.get(id)!)
    .filter(Boolean);
}
