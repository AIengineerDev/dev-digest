/**
 * Guided-reading derivation (R6, C17) — pure. Intersects the facade's
 * rank-ordered candidate pool (`getTopFilesByRank`) with the critical-path
 * chain heads, so "what to read first" agrees with "the chains that matter",
 * and preserves the STRICT descending-rank order the pool already carries —
 * the model may annotate `why`, it may never reorder this list (A24).
 */

export interface ReadingEntry {
  path: string;
  why: null;
  rank_percentile: number | null;
  resolved: true;
}

export interface ReadingResult {
  reading: ReadingEntry[];
  emptyReason: string | null;
}

export function buildReading(
  /** `getTopFilesByRank` result, ALREADY rank-descending — never re-sorted
   *  here (A24's whole point). */
  rankedPaths: readonly string[],
  chainFiles: ReadonlySet<string>,
  percentileOf: (path: string) => number | null,
): ReadingResult {
  const reading: ReadingEntry[] = rankedPaths
    .filter((p) => chainFiles.has(p))
    .map((p) => ({ path: p, why: null, rank_percentile: percentileOf(p), resolved: true as const }));

  return {
    reading,
    emptyReason:
      reading.length === 0
        ? 'No ranked file overlapped a critical-path chain — nothing to recommend reading first yet.'
        : null,
  };
}
