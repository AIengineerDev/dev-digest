import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Onboarding tour data access. The ONLY layer touching the DB for this
 * module.
 *
 * Every component of the R12 state key is `NOT NULL`
 * (`db/schema/context.ts:onboardingTours`), unlike `pr_brief_records`'s two
 * nullable key components (`server/INSIGHTS.md`, 2026-08-18) — that is what
 * lets `upsert` use a plain native `onConflictDoUpdate` on the composite
 * primary key instead of `pr_brief_records`'s `COALESCE`-over-partial-index
 * select-then-write.
 */

export type TourRow = typeof t.onboardingTours.$inferSelect;

export interface TourStateKey {
  repoId: string;
  indexedSha: string;
  indexerVersion: number;
  promptVersion: string;
  provider: string;
  model: string;
}

export interface UpsertTourValues extends TourStateKey {
  sections: unknown[];
  degraded: boolean;
  error: string | null;
  skeletonSections: string[];
  droppedInputs: string[];
  droppedRefs: number;
  droppedSteps: number;
  indexStatus: string | null;
  filesSkipped: number | null;
  trace: Record<string, unknown>;
  generatedAt: Date;
}

export class TourRepository {
  constructor(private readonly db: Db) {}

  /** The repo, scoped to the workspace — `null` when it does not exist or
   *  belongs to another workspace (route treats this as 404). */
  async findRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ id: string; owner: string; name: string; clonePath: string | null } | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  private keyWhere(key: TourStateKey) {
    return and(
      eq(t.onboardingTours.repoId, key.repoId),
      eq(t.onboardingTours.indexedSha, key.indexedSha),
      eq(t.onboardingTours.indexerVersion, key.indexerVersion),
      eq(t.onboardingTours.promptVersion, key.promptVersion),
      eq(t.onboardingTours.provider, key.provider),
      eq(t.onboardingTours.model, key.model),
    );
  }

  async findByKey(key: TourStateKey): Promise<TourRow | undefined> {
    const [row] = await this.db.select().from(t.onboardingTours).where(this.keyWhere(key));
    return row;
  }

  /**
   * Insert-or-update on the six-column composite primary key. No
   * select-then-write race window: `pr_brief_records` needs one because its
   * key columns are nullable and its unique index is `COALESCE`d (not a
   * plain PK), which Postgres cannot target with `onConflictDoUpdate`
   * (`server/INSIGHTS.md`, 2026-08-18). This table's key has no such gap.
   *
   * C18 (two concurrent regenerates): last-write-wins is an accepted outcome
   * here — the failure mode is duplicate spend, bounded by the 5/min rate
   * limit, not a corrupt row. No transaction: generation is this one write.
   */
  async upsert(values: UpsertTourValues): Promise<TourRow> {
    const [row] = await this.db
      .insert(t.onboardingTours)
      .values(values)
      .onConflictDoUpdate({
        target: [
          t.onboardingTours.repoId,
          t.onboardingTours.indexedSha,
          t.onboardingTours.indexerVersion,
          t.onboardingTours.promptVersion,
          t.onboardingTours.provider,
          t.onboardingTours.model,
        ],
        set: {
          sections: values.sections,
          degraded: values.degraded,
          error: values.error,
          skeletonSections: values.skeletonSections,
          droppedInputs: values.droppedInputs,
          droppedRefs: values.droppedRefs,
          droppedSteps: values.droppedSteps,
          indexStatus: values.indexStatus,
          filesSkipped: values.filesSkipped,
          trace: values.trace,
          generatedAt: values.generatedAt,
        },
      })
      .returning();
    return row!;
  }
}
