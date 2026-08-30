import { and, desc, eq } from 'drizzle-orm';
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
   * The workspace predicate rides on `agents` because `ci_runs` carries no
   * workspace of its own — it reaches one only through its installation. The
   * joins are inner on purpose: a run whose installation was deleted
   * (`on delete set null`) can no longer be attributed to a workspace, and
   * showing it to whoever asks first is worse than not showing it at all.
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
        agent: t.agents.name,
      })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(desc(t.ciRuns.ranAt));
  }
}
