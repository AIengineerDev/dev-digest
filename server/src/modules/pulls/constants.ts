/**
 * Diff stats are absent from GitHub's PR-list payload, so freshly imported PRs
 * land with zeroed size/diff and have to be backfilled from the detail endpoint.
 * Each backfill is one extra HTTP call, so a list request repairs at most this
 * many rows; the periodic refetch chips away at any remainder.
 */
export const BACKFILL_LIMIT = 10;
