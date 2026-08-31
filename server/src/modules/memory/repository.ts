import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** A `memory` row, without its 1536-dimension embedding. */
export type MemoryRow = {
  id: string;
  scope: string;
  kind: string;
  content: string;
  confidence: number | null;
  created_at: Date;
  last_used_at: Date | null;
  repo: string | null;
};

/**
 * `memory` data access — the RAG store's rows, read-only for now.
 *
 * The `embedding` column is deliberately never selected: it is a 1536-float
 * vector per row, useless to a reader, and large enough that shipping it to a
 * browser would dominate the response. Similarity search happens in Postgres,
 * not over JSON.
 */
export class MemoryRepository {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<MemoryRow[]> {
    return this.db
      .select({
        id: t.memory.id,
        scope: t.memory.scope,
        kind: t.memory.kind,
        content: t.memory.content,
        confidence: t.memory.confidence,
        created_at: t.memory.createdAt,
        last_used_at: t.memory.lastUsedAt,
        repo: t.repos.fullName,
      })
      .from(t.memory)
      .leftJoin(t.repos, eq(t.memory.repoId, t.repos.id))
      .where(eq(t.memory.workspaceId, workspaceId))
      .orderBy(desc(t.memory.createdAt))
      .limit(200);
  }
}
