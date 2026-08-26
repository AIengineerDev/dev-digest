/**
 * Difficulty rubric (R9) — pure `(C, P) → TourDifficulty + basis`.
 *
 * `C` is the distinct caller-file count from
 * `container.repoIntel.getBlastRadius(repoId, [scope])` — the FACADE, never
 * `modules/blast` (PR-scoped by design, `blast/service.ts:27`, and importing
 * it trips `no-cross-module-internals` anyway). `P` is the scope file's
 * `file_rank.percentile`, or `null` when there is no rank row for it.
 *
 * Table: `low` when `C ≤ 2 && P < 50`; `high` when `C > 15 || P ≥ 90`;
 * `medium` otherwise; `low` + `signal: 'no_index_signal'` when `P` is `null`.
 */
import type { TourDifficulty, TourDifficultyBasis } from '@devdigest/shared';

export interface DifficultyResult {
  difficulty: TourDifficulty;
  basis: TourDifficultyBasis;
}

export function computeDifficulty(callers: number, rankPercentile: number | null): DifficultyResult {
  if (rankPercentile === null) {
    return {
      difficulty: 'low',
      basis: { callers, rank_percentile: null, signal: 'no_index_signal' },
    };
  }

  let difficulty: TourDifficulty;
  if (callers > 15 || rankPercentile >= 90) {
    difficulty = 'high';
  } else if (callers <= 2 && rankPercentile < 50) {
    difficulty = 'low';
  } else {
    difficulty = 'medium';
  }

  return { difficulty, basis: { callers, rank_percentile: rankPercentile, signal: 'indexed' } };
}
