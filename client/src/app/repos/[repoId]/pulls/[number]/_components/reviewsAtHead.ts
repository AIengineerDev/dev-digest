/** The PR's-current-head scoping rule, shared by every surface that folds
 *  over reviews: `SmartDiffViewer`/`DiffTab` (badge counts) and `PrBriefCard`
 *  (the brief's counts row). One rule, one file — the same reasoning
 *  `staleness.ts` is kept beside them for.
 *
 *  Not "the newest review row": one "run all agents" pass writes one review
 *  per agent, so the newest row alone is one agent's opinion. This is the bug
 *  root `INSIGHTS.md` (2026-08-16, PR #482 — 10 rows, newest 9 empty) records
 *  against `ORDER BY created_at DESC LIMIT 1`, and it is why `PrBriefCard`'s
 *  counts row is a fresh fold over every review at head rather than a reuse
 *  of `VerdictBanner`, which speaks for exactly one run. */

import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { isStaleRun } from "./staleness";

/** Every review run against the PR's current head. A `null`/unset
 *  `review.head_sha` counts as current — `isStaleRun`'s tolerant handling for
 *  rows written before the column existed. */
export function reviewsAtHead(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): ReviewRecord[] {
  return (reviews ?? []).filter((r) => r.kind === "review" && !isStaleRun(r.head_sha, headSha));
}

/**
 * The findings the badges describe: every review of the PR's CURRENT head.
 *
 * This must be the same rule the server used to build `finding_lines`, or the
 * count and the severity disagree. `isStaleRun` supplies the tolerant null
 * handling: a review with no recorded head counts as current, because we
 * cannot say otherwise.
 */
export function findingsAtHead(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): FindingRecord[] {
  return reviewsAtHead(reviews, headSha).flatMap((r) => r.findings);
}

/**
 * `blockers` for the brief's counts row: undismissed CRITICAL findings across
 * every review at head — the same rule `ReviewRunAccordion.tsx:70` uses for
 * one run, folded over all of them.
 */
export function blockersAtHead(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): number {
  return findingsAtHead(reviews, headSha).filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}

/**
 * `score` for the brief's counts row: the minimum across reviews at head —
 * the harshest agent's read. A mean would launder one agent's `0` into a
 * passing average; R13 names "score" without an aggregation rule, and this is
 * the plan's stated assumption for it. `null` when no review at head reports
 * one (never "0", which would read as a measured, passing score).
 */
export function scoreAtHead(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): number | null {
  const scores = reviewsAtHead(reviews, headSha)
    .map((r) => r.score)
    .filter((s): s is number => s != null);
  return scores.length === 0 ? null : Math.min(...scores);
}
