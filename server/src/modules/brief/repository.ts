import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Risk, ReviewFocusItem } from '@devdigest/shared';

/**
 * Brief data access. The ONLY layer touching the DB for this module.
 *
 * `getFiles` is R2's structural wall #1: it selects `path, additions,
 * deletions` and nothing else, so `pr_files.patch` never enters a value the
 * service can see — unlike `container.reviewRepo.getPrFiles`, which returns
 * `$inferSelect` including `patch` (`server/src/modules/reviews/repository.ts:38-40`).
 */

export type BriefRecordRow = typeof t.prBriefRecords.$inferSelect;

export interface BriefStateKey {
  prId: string;
  headSha: string;
  intentFingerprint: string | null;
  repoIndexedSha: string | null;
  promptVersion: number;
  provider: string;
  model: string;
}

export interface UpsertBriefValues {
  prId: string;
  headSha: string;
  intentFingerprint: string | null;
  repoIndexedSha: string | null;
  promptVersion: number;
  provider: string;
  model: string;
  what: string;
  why: string;
  riskLevel: string;
  risks: Risk[];
  reviewFocus: ReviewFocusItem[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  budgetTokens: number;
  droppedInputs: string[];
  droppedRefs: number;
  degraded: boolean;
  error: string | null;
  generatedAt: Date | null;
}

export class BriefRepository {
  constructor(private db: Db) {}

  async findPull(workspaceId: string, prId: string) {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(repoId: string): Promise<{ owner: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  /** R2's structural wall #1 — three columns, never `patch`. */
  async getFiles(prId: string): Promise<{ path: string; additions: number; deletions: number }[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async getCommitSubjects(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
    return rows.map((r) => r.message);
  }

  private keyWhere(key: BriefStateKey) {
    return and(
      eq(t.prBriefRecords.prId, key.prId),
      eq(t.prBriefRecords.headSha, key.headSha),
      key.intentFingerprint === null
        ? isNull(t.prBriefRecords.intentFingerprint)
        : eq(t.prBriefRecords.intentFingerprint, key.intentFingerprint),
      key.repoIndexedSha === null
        ? isNull(t.prBriefRecords.repoIndexedSha)
        : eq(t.prBriefRecords.repoIndexedSha, key.repoIndexedSha),
      eq(t.prBriefRecords.promptVersion, key.promptVersion),
      eq(t.prBriefRecords.provider, key.provider),
      eq(t.prBriefRecords.model, key.model),
    );
  }

  async findByKey(key: BriefStateKey): Promise<BriefRecordRow | undefined> {
    const [row] = await this.db.select().from(t.prBriefRecords).where(this.keyWhere(key));
    return row;
  }

  /**
   * Insert-or-update by the R6 state key. No transaction (`server/INSIGHTS.md`,
   * 2026-08-09 — nothing in this server is atomic); the cache-check-then-write
   * sequence in `service.ts` already selects before it writes, and the state
   * key's partial unique index (`COALESCE`d, `schema/reviews.ts`) is what
   * actually enforces C10's "two rows for one state must never exist" against
   * a genuine race, not this method.
   */
  async upsert(values: UpsertBriefValues): Promise<BriefRecordRow> {
    const key: BriefStateKey = {
      prId: values.prId,
      headSha: values.headSha,
      intentFingerprint: values.intentFingerprint,
      repoIndexedSha: values.repoIndexedSha,
      promptVersion: values.promptVersion,
      provider: values.provider,
      model: values.model,
    };
    const existing = await this.findByKey(key);
    if (existing) {
      const [updated] = await this.db
        .update(t.prBriefRecords)
        .set(values)
        .where(eq(t.prBriefRecords.id, existing.id))
        .returning();
      return updated!;
    }
    const [inserted] = await this.db.insert(t.prBriefRecords).values(values).returning();
    return inserted!;
  }
}
