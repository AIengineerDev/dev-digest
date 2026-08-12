import type { ReviewRecord } from "@devdigest/shared";
import { countBySeverity } from "../FindingsPanel/helpers";

export type SeverityCounts = ReturnType<typeof countBySeverity>;

/**
 * run_id → findings per severity, so the timeline can show the same icon
 * breakdown the PR list shows.
 *
 * Derived from the loaded reviews rather than the run row: `RunSummary` only
 * carries a flat `findings_count`, and the detail page already has every
 * review's findings in cache — no extra request, no contract change. Reviews
 * with a null `run_id` (pre-dating the FK) are skipped; several reviews sharing
 * a run_id are summed, so a run that produced more than one review still counts
 * once.
 */
export function severityCountsByRun(reviews: ReviewRecord[]): Record<string, SeverityCounts> {
  const byRun: Record<string, SeverityCounts> = {};
  for (const review of reviews) {
    if (!review.run_id) continue;
    const counts = countBySeverity(review.findings);
    const acc = byRun[review.run_id];
    if (!acc) {
      byRun[review.run_id] = counts;
      continue;
    }
    for (const sv of Object.keys(counts) as (keyof SeverityCounts)[]) acc[sv] += counts[sv];
  }
  return byRun;
}

/** True when at least one severity has a finding — otherwise the row keeps its text. */
export function hasSeverities(counts: SeverityCounts | undefined): boolean {
  return !!counts && Object.values(counts).some((n) => n > 0);
}
