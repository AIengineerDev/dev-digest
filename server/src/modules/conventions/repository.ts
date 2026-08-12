import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * Conventions data-access. Owns the `conventions` table only.
 *
 * It reads `repos` for the owner/name/full_name a scan needs, which is a read of
 * another module's table and deliberately kept to exactly that: no writes, no
 * joins that would make this module a second source of truth for a repo.
 *
 * Every method takes an executor so the service can compose the re-scan's
 * delete-then-insert into one transaction; it never opens one itself.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: ConventionCategory;
  rule: string;
  rationale: string | null;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
  headSha: string | null;
}

export interface UpdateConvention {
  rule?: string;
  category?: ConventionCategory;
  status?: ConventionStatus;
}

export interface RepoIdentity {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** The repo, scoped to the workspace. Undefined = not this tenant's repo. */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoIdentity | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * Candidates for a repo. Accepted first, then pending, then rejected, and
   * within each by confidence: the list is a work queue, and what a human has
   * already blessed should not be buried under fresh guesses.
   */
  async listForRepo(
    workspaceId: string,
    repoId: string,
    filter: { status?: ConventionStatus } = {},
    exec: Executor = this.db,
  ): Promise<ConventionRow[]> {
    const conditions = [
      eq(t.conventions.workspaceId, workspaceId),
      eq(t.conventions.repoId, repoId),
    ];
    if (filter.status) conditions.push(eq(t.conventions.status, filter.status));
    return exec
      .select()
      .from(t.conventions)
      .where(and(...conditions))
      .orderBy(asc(t.conventions.status), desc(t.conventions.confidence));
  }

  async getById(
    workspaceId: string,
    id: string,
    exec: Executor = this.db,
  ): Promise<ConventionRow | undefined> {
    const [row] = await exec
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /** Accepted candidates for a repo, optionally narrowed to specific ids. */
  async listAccepted(
    workspaceId: string,
    repoId: string,
    ids?: string[],
    exec: Executor = this.db,
  ): Promise<ConventionRow[]> {
    const conditions = [
      eq(t.conventions.workspaceId, workspaceId),
      eq(t.conventions.repoId, repoId),
      eq(t.conventions.status, 'accepted'),
    ];
    if (ids && ids.length > 0) conditions.push(inArray(t.conventions.id, ids));
    return exec
      .select()
      .from(t.conventions)
      .where(and(...conditions))
      .orderBy(desc(t.conventions.confidence));
  }

  /**
   * Drop the undecided candidates of a repo. A re-scan replaces them; accepted
   * and rejected rows survive, which is the whole reason `status` is a tri-state
   * rather than a boolean.
   */
  async deletePendingForRepo(
    workspaceId: string,
    repoId: string,
    exec: Executor = this.db,
  ): Promise<number> {
    const rows = await exec
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  async insertMany(
    values: InsertConvention[],
    exec: Executor = this.db,
  ): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return exec.insert(t.conventions).values(values).returning();
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
    exec: Executor = this.db,
  ): Promise<ConventionRow | undefined> {
    const [row] = await exec
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
