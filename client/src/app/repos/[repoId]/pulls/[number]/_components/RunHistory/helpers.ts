import type { ReviewRecord, RunSummary } from "@devdigest/shared";
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

/**
 * R11 — which run_ids are the FIRST member of their multi-agent group, in the
 * order the timeline already renders (no reordering: a group's members render
 * wherever they already sort, only the first gets a header above it). Runs
 * with a null `multi_agent_run_id` never get one. `size` is the group's total
 * member count from the run list — not necessarily contiguous in the sorted
 * list.
 */
export function groupHeaderIds(sortedRuns: RunSummary[]): Map<string, number> {
  const sizeById = new Map<string, number>();
  for (const r of sortedRuns) {
    if (!r.multi_agent_run_id) continue;
    sizeById.set(r.multi_agent_run_id, (sizeById.get(r.multi_agent_run_id) ?? 0) + 1);
  }
  const headers = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of sortedRuns) {
    const gid = r.multi_agent_run_id;
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    headers.set(r.run_id, sizeById.get(gid)!);
  }
  return headers;
}
