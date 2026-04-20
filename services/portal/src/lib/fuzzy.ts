// ============================================================
// Fuzzy name similarity + top-N match helper
// ------------------------------------------------------------
// Hugo's rule (see .auto-memory/feedback_business_link_autocomplete.md):
// any "link an entity" search box in Prisma must proactively surface
// 4–5 closest fuzzy matches as the user types — no Enter key, no button
// press, and no strict-substring dead-ends. This file centralises the
// scorer so every surface (Businesses page, Leads detail panel,
// whatever's next) uses the same behavior.
//
// scoreNameSimilarity()
//   Returns 0..1 where 1 = identical. Mix of exact/contains/word-overlap
//   checks. Good enough for short business-name inputs; cheap to run
//   across every customer in the QB cache on each keystroke.
//
// topFuzzyMatches()
//   Generic scorer-over-items. Pass the items, one or more key extractors
//   (so we can score against e.g. both displayName AND companyName and
//   keep the higher), and get back up to `limit` items sorted by score.
// ============================================================

/** Lowercase + trim + collapse whitespace. */
const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * 0..1 similarity score between two strings.
 * Higher = closer. Designed to be permissive — any partial / typo
 * overlap still registers above 0 so the user sees suggestions.
 */
export function scoreNameSimilarity(a: string, b: string): number {
  const la = norm(a);
  const lb = norm(b);
  if (!la || !lb) return 0;
  if (la === lb) return 1;
  // "sum" inside "summum liner" → strong partial hit
  if (la.includes(lb) || lb.includes(la)) return 0.85;

  // Word-level overlap — catches "summ liner" ↔ "groupe summum liner".
  const wordsA = la.split(' ');
  const wordsB = lb.split(' ');
  let wordHits = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (!wa || !wb) continue;
      if (wa === wb) { wordHits++; break; }
      // prefix or substring on reasonably long tokens
      if ((wa.length > 2 && wb.startsWith(wa)) ||
          (wb.length > 2 && wa.startsWith(wb)) ||
          (wa.length > 3 && wb.includes(wa)) ||
          (wb.length > 3 && wa.includes(wb))) {
        wordHits++;
        break;
      }
    }
  }
  const wordScore = wordHits / Math.max(wordsA.length, wordsB.length);

  // Character-level bigram overlap — catches typos like
  // "conceptino" ↔ "conceptions".
  const bigrams = (s: string): Set<string> => {
    const bi = new Set<string>();
    const compact = s.replace(/\s+/g, '');
    for (let i = 0; i < compact.length - 1; i++) bi.add(compact.slice(i, i + 2));
    return bi;
  };
  const bA = bigrams(la);
  const bB = bigrams(lb);
  if (bA.size === 0 || bB.size === 0) return wordScore;
  let shared = 0;
  bA.forEach(g => { if (bB.has(g)) shared++; });
  const bigramScore = (2 * shared) / (bA.size + bB.size);

  return Math.max(wordScore, bigramScore * 0.9);
}

export interface TopMatchOptions {
  /** How many suggestions to return. Hugo's rule: 4–5. */
  limit?: number;
  /**
   * Minimum score to be included when candidates exist above the threshold.
   * Kept permissive so partial / typo hits still show. If the query is so
   * far off that nothing clears this bar, we still return the top
   * `minFallback` rows anyway so the user has something to click — typing
   * garbage shouldn't strand them on an empty list.
   */
  minScore?: number;
  /** How many rows to surface even if nothing clears `minScore`. */
  minFallback?: number;
}

/**
 * Score `items` against `query` using the highest score across `keyFns`
 * (so searching "Sum" matches Summum via either displayName or companyName),
 * then return the top `limit` items sorted by score descending.
 *
 * Returns [] when the query is blank so callers can use this directly
 * on onChange without showing stale suggestions on an empty input.
 */
export function topFuzzyMatches<T>(
  query: string,
  items: readonly T[],
  keyFns: ((item: T) => string | null | undefined)[],
  { limit = 5, minScore = 0.15, minFallback = 4 }: TopMatchOptions = {},
): T[] {
  const q = query.trim();
  if (!q || items.length === 0) return [];

  const scored = items.map(item => {
    let best = 0;
    for (const fn of keyFns) {
      const v = fn(item);
      if (!v) continue;
      const s = scoreNameSimilarity(q, v);
      if (s > best) best = s;
    }
    return { item, score: best };
  }).sort((a, b) => b.score - a.score);

  const passing = scored.filter(s => s.score >= minScore);
  if (passing.length > 0) return passing.slice(0, limit).map(s => s.item);

  // No hits above the bar — surface the top few anyway so the user always
  // has ~4 clickable suggestions, per Hugo's "4 or 5 that look like it" rule.
  return scored.slice(0, Math.min(minFallback, scored.length)).map(s => s.item);
}
