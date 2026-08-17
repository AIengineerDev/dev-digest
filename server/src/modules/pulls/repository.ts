import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Pulls data-access. Owns `pull_requests`, `pr_files` and `pr_commits`.
 *
 * It also reads `repos`, `reviews`, `findings` and `agent_runs` — reads only,
 * no writes and no joins that would make this module a second source of truth
 * for another module's table. The reads exist because the PR list renders a
 * score ring, a findings breakdown and a cost column beside each row.
 *
 * Every method takes an executor so the service can compose the detail
 * refresh's delete-then-insert into one transaction; it never opens one itself.
 */

export type PullRequestRow = typeof t.pullRequests.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

export interface UpsertPullRequest {
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface InsertPrFile {
  prId: string;
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface InsertPrCommit {
  prId: string;
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export class PullsRepository {
  constructor(private db: Db) {}

  // ---- repos / pull requests ------------------------------------------------

  async findRepoInWorkspace(
    workspaceId: string,
    repoId: string,
    exec: Executor = this.db,
  ): Promise<RepoRow | undefined> {
    const [repo] = await exec
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo;
  }

  async findRepoById(repoId: string, exec: Executor = this.db): Promise<RepoRow | undefined> {
    const [repo] = await exec.select().from(t.repos).where(eq(t.repos.id, repoId));
    return repo;
  }

  async findPrInWorkspace(
    workspaceId: string,
    prId: string,
    exec: Executor = this.db,
  ): Promise<PullRequestRow | undefined> {
    const [pr] = await exec
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr;
  }

  async listPrsByRepo(repoId: string, exec: Executor = this.db): Promise<PullRequestRow[]> {
    return exec.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /** Idempotent import — unique on (repo_id, number). */
  async upsertPr(values: UpsertPullRequest, exec: Executor = this.db): Promise<void> {
    await exec
      .insert(t.pullRequests)
      .values(values)
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: values.title,
          headSha: values.headSha,
          status: values.status,
          updatedAt: values.updatedAt,
        },
      });
  }

  async updateDiffStats(
    prId: string,
    stats: DiffStats,
    exec: Executor = this.db,
  ): Promise<void> {
    await exec.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  /**
   * Persist what a detail refresh learned about the PR.
   *
   * `headSha` belongs in here with the files, not in a later write: the files
   * being replaced ARE that head's files, and Smart Diff picks which findings
   * badge them by comparing `pull_requests.head_sha` to each review's. Written
   * apart — or not at all — the row can hold the new head's patches while
   * still naming the old head, and the previous commit's findings then attach
   * to a diff they never saw.
   */
  async updateDetail(
    prId: string,
    detail: DiffStats & { body: string | null; headSha?: string },
    exec: Executor = this.db,
  ): Promise<void> {
    await exec.update(t.pullRequests).set(detail).where(eq(t.pullRequests.id, prId));
  }

  // ---- files / commits ------------------------------------------------------

  async listFiles(prId: string, exec: Executor = this.db): Promise<PrFileRow[]> {
    return exec.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string, exec: Executor = this.db): Promise<PrCommitRow[]> {
    return exec.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  async deleteFiles(prId: string, exec: Executor = this.db): Promise<void> {
    await exec.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async insertFiles(rows: InsertPrFile[], exec: Executor = this.db): Promise<void> {
    if (rows.length === 0) return;
    await exec.insert(t.prFiles).values(rows);
  }

  async deleteCommits(prId: string, exec: Executor = this.db): Promise<void> {
    await exec.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  async insertCommits(rows: InsertPrCommit[], exec: Executor = this.db): Promise<void> {
    if (rows.length === 0) return;
    await exec.insert(t.prCommits).values(rows);
  }

  // ---- cross-module reads for the list columns ------------------------------

  /** Reviews of kind `review` for these PRs, newest first. */
  async listReviewsForPrs(
    prIds: string[],
    exec: Executor = this.db,
  ): Promise<{ id: string; prId: string; score: number | null }[]> {
    if (prIds.length === 0) return [];
    return exec
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async listFindingSeverities(
    reviewIds: string[],
    exec: Executor = this.db,
  ): Promise<{ reviewId: string; severity: string }[]> {
    if (reviewIds.length === 0) return [];
    return exec
      .select({ reviewId: t.findings.reviewId, severity: t.findings.severity })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
  }

  /** Completed runs only, newest first — a later failed run must not blank the cost. */
  async listDoneRunCosts(
    prIds: string[],
    exec: Executor = this.db,
  ): Promise<{ prId: string | null; costUsd: number | null }[]> {
    if (prIds.length === 0) return [];
    return exec
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
      .orderBy(desc(t.agentRuns.ranAt));
  }
}
