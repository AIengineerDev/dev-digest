import { and, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Smart-diff data access. Owns no table of its own: it reads the PR's imported
 * files and the findings of its latest review, both read-only.
 *
 * That is the feature — Smart Diff is a re-projection of data two other modules
 * already wrote, which is exactly why it costs no model call.
 */

export interface SmartDiffFileRow {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingRow {
  file: string;
  startLine: number;
}

export class SmartDiffRepository {
  constructor(private readonly db: Db) {}

  /** The PR row, scoped to the workspace. Null when it is not this caller's. */
  async findPull(workspaceId: string, prId: string) {
    const [pr] = await this.db
      .select({ id: t.pullRequests.id, headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr ?? null;
  }

  /** Changed files as `GET /pulls/:id` persisted them. */
  async filesForPull(prId: string): Promise<SmartDiffFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * Findings from every review of the PR's CURRENT head, or `[]` when it has
   * never been reviewed.
   *
   * Not "the latest review row": one trigger of "run all agents" writes one
   * review per agent, so the newest row is one agent's opinion and scoping to
   * it hides the other three. Scoping by head is what makes the badges agree
   * with the Findings tab, which lists every run against the current head.
   *
   * A null `head_sha` on either side means "cannot tell" and is treated as
   * current — the same tolerant reading `isStaleRun` uses in the UI. Rows
   * written before the column existed carry null, and calling them stale would
   * blank the badges on every historical review.
   *
   * `kind = 'review'` excludes the summary rows, which carry no findings.
   */
  async findingsAtHead(prId: string, headSha: string | null): Promise<SmartDiffFindingRow[]> {
    const atHead = headSha
      ? or(isNull(t.reviews.headSha), eq(t.reviews.headSha, headSha))
      : undefined;
    return this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review'), atHead));
  }
}
