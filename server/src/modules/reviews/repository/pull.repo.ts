import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { DerivedIntent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

export async function getPrCommits(
  db: Db,
  prId: string,
): Promise<(typeof t.prCommits.$inferSelect)[]> {
  return db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent -----------------------------------------------------------

/**
 * Upsert the FULL derived intent (specs/04-intent-layer.md). Single statement —
 * no transaction is needed and none is claimed.
 */
export async function upsertIntent(db: Db, prId: string, intent: DerivedIntent): Promise<void> {
  const values = {
    prId,
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    category: intent.category,
    summary: intent.summary,
    confidence: intent.confidence,
    band: intent.band,
    sources: intent.sources,
    provider: intent.provider,
    model: intent.model,
    promptVersion: intent.prompt_version,
    fingerprint: intent.fingerprint,
    degraded: intent.degraded,
    error: intent.error ?? null,
    derivedAt: intent.derived_at ? new Date(intent.derived_at) : null,
  };
  await db.insert(t.prIntent).values(values).onConflictDoUpdate({
    target: t.prIntent.prId,
    set: values,
  });
}

export async function getIntent(db: Db, prId: string): Promise<DerivedIntent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return rowToDerivedIntent(row);
}

/** Row shape → `DerivedIntent`. Exported for the service's cache-check read. */
export function rowToDerivedIntent(row: typeof t.prIntent.$inferSelect): DerivedIntent {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    category: (row.category ?? 'unknown') as DerivedIntent['category'],
    summary: row.summary ?? '',
    confidence: row.confidence ?? 0,
    band: (row.band ?? 'low') as DerivedIntent['band'],
    sources: (row.sources ?? []) as DerivedIntent['sources'],
    provider: row.provider,
    model: row.model,
    prompt_version: row.promptVersion,
    fingerprint: row.fingerprint ?? '',
    derived_at: row.derivedAt ? row.derivedAt.toISOString() : null,
    degraded: row.degraded,
    error: row.error,
  };
}
