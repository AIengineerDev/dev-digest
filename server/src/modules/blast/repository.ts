import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Blast-radius data access. Owns no table: it reads the PR and the paths its
 * diff touched, both read-only, and hands them to the repo-intel facade.
 */
export class BlastRepository {
  constructor(private readonly db: Db) {}

  /** The PR and the repo it belongs to, scoped to the workspace. */
  async findPull(workspaceId: string, prId: string) {
    const [pr] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr ?? null;
  }

  /**
   * Repo-relative paths of the PR's changed files.
   *
   * These are the blast's only input: the facade takes changed files, not a PR,
   * so "which files" is settled here and the impact analysis stays PR-agnostic.
   */
  async changedFiles(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
