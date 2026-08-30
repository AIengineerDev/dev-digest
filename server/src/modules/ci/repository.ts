import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;

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
}
