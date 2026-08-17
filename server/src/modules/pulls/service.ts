import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { Db } from '../../db/client.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { BACKFILL_LIMIT } from './constants.js';
import {
  findingsByPr,
  latestCostByPr,
  latestReviewByPr,
  toPrDetail,
  toPrMeta,
} from './helpers.js';
import { PullsRepository, type PullRequestRow, type RepoRow } from './repository.js';

/**
 * Pulls service — import PRs from GitHub and read them back.
 *
 * Local-first is the rule that shapes every method here: when a token is
 * configured we refresh from GitHub, but a missing token, an offline machine or
 * a GitHub error must never fail a read. Already-imported and seeded PRs stay
 * viewable, so each remote call is wrapped and degrades to persisted data.
 *
 * Review triggering is A2's, not this module's — this one imports and reads.
 */

/** Structural, so the service stays transport-agnostic and never imports fastify. */
export interface Logger {
  warn(obj: unknown, msg?: string): void;
}

export class PullsService {
  private readonly db: Db;
  private readonly repo: PullsRepository;

  constructor(private container: Container) {
    this.db = container.db;
    this.repo = new PullsRepository(container.db);
  }

  /** The PR list, with its score ring, findings breakdown and cost column. */
  async listForRepo(workspaceId: string, repoId: string, log: Logger): Promise<PrMeta[]> {
    const repo = await this.repo.findRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.tryGitHub(log, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    if (gh) await this.syncFromGitHub(gh, repo, workspaceId, log);

    const rows = await this.repo.listPrsByRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows, log);

    const prIds = rows.map((r) => r.id);
    const reviews = latestReviewByPr(await this.repo.listReviewsForPrs(prIds));
    const findings = findingsByPr(
      await this.repo.listFindingSeverities([...reviews.values()].map((rv) => rv.id)),
      reviews,
    );
    const costs = latestCostByPr(await this.repo.listDoneRunCosts(prIds));

    const now = Date.now();
    return rows.map((r) =>
      toPrMeta(r, {
        review: reviews.get(r.id),
        costUsd: costs.get(r.id),
        findings: findings.get(r.id),
        now,
      }),
    );
  }

  /** Full PR detail. Refreshes from GitHub when possible, else serves persisted. */
  async getDetail(workspaceId: string, prId: string, log: Logger): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      // One transaction for the whole refresh. These writes replace the PR's
      // files and commits wholesale; interrupted between the delete and the
      // insert, the PR is left with no files at all — which surfaces as "the
      // diff vanished", not as an error. The GitHub fetch above stays outside
      // the transaction so no network call holds it open.
      await this.db.transaction(async (tx) => {
        await this.repo.deleteFiles(pr.id, tx);
        await this.repo.insertFiles(
          detail.files.map((f) => ({
            prId: pr.id,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
          tx,
        );
        await this.repo.deleteCommits(pr.id, tx);
        await this.repo.insertCommits(
          detail.commits.map((c) => ({
            prId: pr.id,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
          tx,
        );
        await this.repo.updateDetail(
          pr.id,
          {
            body: detail.body ?? null,
            // Backfilled here too, so the list shows real size/files.
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
            // In the SAME transaction as the files it describes. This path is
            // the only one that can replace a PR's diff without going through
            // the list sync, so leaving the head behind here is what lets a
            // refreshed diff be badged with the previous commit's findings.
            headSha: detail.head_sha,
          },
          tx,
        );
      });

      return { ...detail, id: pr.id };
    } catch (err) {
      log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const [files, commits] = await Promise.all([
        this.repo.listFiles(pr.id),
        this.repo.listCommits(pr.id),
      ]);
      return toPrDetail(pr, files, commits);
    }
  }

  /**
   * Inline review comments are proxied live to GitHub with no local persistence,
   * so the Files-changed tab stays in lock-step instead of mirroring stale data.
   */
  async listComments(
    workspaceId: string,
    prId: string,
    log: Logger,
  ): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.tryGitHub(log, 'GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }

    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  // ---- internals ------------------------------------------------------------

  private async resolvePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRequestRow; repo: RepoRow }> {
    const pr = await this.repo.findPrInWorkspace(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.findRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  /** A missing or misconfigured token is a degraded read, never an error. */
  private async tryGitHub(log: Logger, message: string): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      log.warn({ err }, message);
      return null;
    }
  }

  private async syncFromGitHub(
    gh: GitHubClient,
    repo: RepoRow,
    workspaceId: string,
    log: Logger,
  ): Promise<void> {
    try {
      const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
      for (const pr of pulls) {
        await this.repo.upsertPr({
          workspaceId,
          repoId: repo.id,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        });
      }
    } catch (err) {
      log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    }
  }

  /** Mutates `rows` in place so the caller maps the repaired values. */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: RepoRow,
    rows: PullRequestRow[],
    log: Logger,
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, BACKFILL_LIMIT);

    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.repo.updateDiffStats(r.id, stats);
        r.additions = stats.additions;
        r.deletions = stats.deletions;
        r.filesCount = stats.filesCount;
      } catch (err) {
        log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }
}
