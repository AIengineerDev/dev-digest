import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { PrCommitRow, PrFileRow, PullRequestRow } from './repository.js';
import { deriveReviewStatus } from './status.js';

/**
 * Pure shaping for the pulls module: grouping the cross-module read rows and
 * mapping database rows to the wire contracts. No I/O, no Drizzle, no Fastify —
 * everything here is testable by calling it.
 */

export interface SeverityCounts {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

export interface LatestReview {
  id: string;
  score: number | null;
}

/**
 * Rows arrive newest-first, so the first one seen per PR is the latest review.
 */
export function latestReviewByPr(
  rows: { id: string; prId: string; score: number | null }[],
): Map<string, LatestReview> {
  const byPr = new Map<string, LatestReview>();
  for (const rv of rows) {
    if (!byPr.has(rv.prId)) byPr.set(rv.prId, { id: rv.id, score: rv.score });
  }
  return byPr;
}

/**
 * Findings are counted for the SAME review the score ring shows, not for every
 * review the PR ever had — otherwise the column and the ring describe different
 * runs, and a re-review adds to the counts instead of replacing them.
 *
 * Dismissed findings are counted: the column mirrors the PR detail page, which
 * shows dismissed findings struck through rather than hiding them.
 *
 * A PR with a review but no findings gets zeros, not absence — "reviewed,
 * nothing found" and "never reviewed" are different states.
 */
export function findingsByPr(
  rows: { reviewId: string; severity: string }[],
  reviews: Map<string, LatestReview>,
): Map<string, SeverityCounts> {
  const byPr = new Map<string, SeverityCounts>();
  if (reviews.size === 0) return byPr;

  const reviewIdToPr = new Map([...reviews].map(([prId, rv]) => [rv.id, prId]));
  for (const f of rows) {
    const prId = reviewIdToPr.get(f.reviewId);
    if (!prId) continue;
    const counts =
      byPr.get(prId) ?? byPr.set(prId, { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }).get(prId)!;
    if (f.severity in counts) counts[f.severity as keyof SeverityCounts] += 1;
  }
  for (const prId of reviews.keys()) {
    if (!byPr.has(prId)) byPr.set(prId, { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  }
  return byPr;
}

/**
 * The LATEST completed run's cost, not a sum over all runs — the column answers
 * "what does reviewing this PR cost", not "what have I spent on it".
 */
export function latestCostByPr(
  rows: { prId: string | null; costUsd: number | null }[],
): Map<string, number | null> {
  const byPr = new Map<string, number | null>();
  for (const run of rows) {
    if (run.prId && !byPr.has(run.prId)) byPr.set(run.prId, run.costUsd);
  }
  return byPr;
}

export function toPrMeta(
  row: PullRequestRow,
  extras: {
    review: LatestReview | undefined;
    costUsd: number | null | undefined;
    findings: SeverityCounts | undefined;
    now: number;
  },
): PrMeta {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: deriveReviewStatus({
      ghStatus: row.status,
      lastReviewedSha: row.lastReviewedSha,
      headSha: row.headSha,
      updatedAt: row.updatedAt,
      now: extras.now,
    }),
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    score: extras.review ? extras.review.score : null,
    cost_usd: extras.costUsd ?? null,
    findings: extras.findings ?? null,
  };
}

/** The persisted fallback shape, used when GitHub is unavailable. */
export function toPrDetail(
  pr: PullRequestRow,
  files: PrFileRow[],
  commits: PrCommitRow[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
