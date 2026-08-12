/* Staleness — was this run/review produced against the PR's current head?
   Findings outlive the code they describe: a run from three pushes ago keeps
   listing bugs in a file that may since have been rewritten or deleted, and
   without a marker it is indistinguishable from a run against the code as it
   stands now. Server-side each run and review is stamped with the head it saw
   (`agent_runs.head_sha` / `reviews.head_sha`). */

/**
 * True only when we KNOW the shas differ. A null on either side means "cannot
 * tell" — runs written before the column exists, or a PR whose head we have not
 * loaded — and is deliberately treated as current: marking unknowns stale would
 * paint every historical run with a warning it may not deserve.
 */
export function isStaleRun(
  ranAgainst: string | null | undefined,
  currentHead: string | null | undefined,
): boolean {
  if (!ranAgainst || !currentHead) return false;
  return ranAgainst !== currentHead;
}

/** Display form of a sha — 7 chars, the length git itself abbreviates to. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}
