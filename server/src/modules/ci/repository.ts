import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;

/** A `ci_runs` row with the agent name joined in from its installation. */
export type CiRunRow = {
  id: string;
  ci_installation_id: string | null;
  pr_number: number | null;
  ran_at: Date | null;
  status: string | null;
  findings_count: number | null;
  cost_usd: number | null;
  github_url: string | null;
  source: string | null;
  agent: string | null;
  repo: string | null;
};

/**
 * `ci_installations` data access. One row per `(agent_id, repo)` — Install
 * (Phase 4) upserts it: a fresh row on the first export, a refreshed
 * `installed_at` on every re-export (R7, C1). No transaction here; the
 * service owns write ordering (commit → open/reuse PR → this write) because a
 * single-row upsert needs no atomicity beyond what one statement gives it
 * (`repository-no-adapters`, `.dependency-cruiser.cjs:45`).
 */
export class CiRepository {
  constructor(private readonly db: Db) {}

  async findByAgentAndRepo(agentId: string, repo: string): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));
    return row;
  }

  async insert(input: {
    agentId: string;
    repo: string;
    targetType: CiInstallationRow['targetType'];
  }): Promise<CiInstallationRow> {
    const [row] = await this.db.insert(t.ciInstallations).values(input).returning();
    return row!;
  }

  /** Refresh `installed_at` on a re-export — leaves the row count at one. */
  async touchInstalledAt(id: string): Promise<CiInstallationRow> {
    const [row] = await this.db
      .update(t.ciInstallations)
      .set({ installedAt: new Date() })
      .where(eq(t.ciInstallations.id, id))
      .returning();
    return row!;
  }

  async listByAgent(agentId: string): Promise<CiInstallationRow[]> {
    return this.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agentId));
  }

  /**
   * Every CI run in the workspace, newest first.
   *
   * A row reaches a workspace by one of two paths and never both: an ingested
   * Actions run carries `repo_id`, while a run an exported agent reported back
   * carries an installation. Both joins are therefore LEFT, and the workspace
   * predicate is the OR of the two — an inner join on either would silently
   * drop the other kind.
   */
  async listRuns(workspaceId: string): Promise<CiRunRow[]> {
    return this.db
      .select({
        id: t.ciRuns.id,
        ci_installation_id: t.ciRuns.ciInstallationId,
        pr_number: t.ciRuns.prNumber,
        ran_at: t.ciRuns.ranAt,
        status: t.ciRuns.status,
        findings_count: t.ciRuns.findingsCount,
        cost_usd: t.ciRuns.costUsd,
        github_url: t.ciRuns.githubUrl,
        source: t.ciRuns.source,
        agent: sql<string | null>`coalesce(${t.agents.name}, ${t.ciRuns.workflowName})`,
        repo: t.repos.fullName,
      })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .leftJoin(t.repos, eq(t.ciRuns.repoId, t.repos.id))
      .where(or(eq(t.agents.workspaceId, workspaceId), eq(t.repos.workspaceId, workspaceId)))
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(200);
  }

  /**
   * The workspace's repositories — what `syncWorkflowRuns` iterates.
   *
   * Read here rather than through another module's repository: the container
   * exposes no repos repository, and importing one module's internals from
   * another is exactly what `no-cross-module-internals` forbids. A table read
   * is data access, which is this layer's job.
   */
  async listRepos(workspaceId: string): Promise<{ id: string; owner: string; name: string; fullName: string }[]> {
    return this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
      })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
  }

  /**
   * Insert the Actions runs this repo has not stored yet.
   *
   * Idempotent on `(repo_id, external_id)`: re-syncing the same window inserts
   * nothing. There is no unique index behind that — the column was added to an
   * existing table — so the check is a read-then-filter, which is honest about
   * being last-writer-wins under two concurrent syncs of the same repo.
   */
  async ingestWorkflowRuns(
    repoId: string,
    runs: {
      externalId: string;
      workflowName: string;
      status: string | null;
      prNumber: number | null;
      htmlUrl: string;
      ranAt: Date | null;
    }[],
  ): Promise<number> {
    if (runs.length === 0) return 0;

    const existing = await this.db
      .select({ externalId: t.ciRuns.externalId })
      .from(t.ciRuns)
      .where(eq(t.ciRuns.repoId, repoId));
    const seen = new Set(existing.map((r) => r.externalId).filter(Boolean));

    const fresh = runs.filter((r) => !seen.has(r.externalId));
    if (fresh.length === 0) return 0;

    await this.db.insert(t.ciRuns).values(
      fresh.map((r) => ({
        repoId,
        externalId: r.externalId,
        workflowName: r.workflowName,
        status: r.status,
        prNumber: r.prNumber,
        githubUrl: r.htmlUrl,
        ranAt: r.ranAt,
        source: 'github_actions',
      })),
    );
    return fresh.length;
  }

}
