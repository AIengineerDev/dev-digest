import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalExpectation, EvalOwnerKind } from '@devdigest/shared';

/**
 * Eval data-access. Owns `eval_cases` only.
 *
 * It reads `pr_files` for the patch a case pins as its input — a read of the
 * pulls module's table and deliberately kept to exactly that: no writes, and no
 * joins that would make this module a second source of truth for a PR.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseInputMeta;
  expectedOutput: EvalExpectation[];
  notes: string | null;
}

/**
 * What a case remembers about where it came from (spec 13, R2).
 *
 * A case born from a finding pins the PR it was taken from. A hand-written one
 * has no PR behind it — `manual` says so explicitly rather than leaving the
 * provenance null and indistinguishable from "we lost it".
 */
export type EvalCaseInputMeta =
  | {
      pr_number: number;
      head_sha: string | null;
      source_finding_id: string;
      source_run_id: string | null;
    }
  | { manual: true };

export class EvalRepository {
  constructor(private readonly db: Db) {}

  /** The stored patch for one file of one PR — the case's pinned input. */
  async filePatch(prId: string, path: string): Promise<string | null> {
    const [row] = await this.db
      .select({ patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, path)));
    return row?.patch ?? null;
  }

  /** Every file path the PR touched — the editor's Files tab. */
  async filePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  /** The agent that owns cases built from this review, for the editor header. */
  async agentName(agentId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: t.agents.name })
      .from(t.agents)
      .where(eq(t.agents.id, agentId));
    return row?.name ?? null;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db.insert(t.evalCases).values(values).returning();
    return row!;
  }

  async listByOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
  }

  /** Every agent in the workspace, for the dashboard's one-row-per-agent list. */
  async agents(workspaceId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
  }

  /** Every case in the workspace — the dashboard groups these by owner. */
  async allCases(workspaceId: string): Promise<EvalCaseRow[]> {
    return this.db.select().from(t.evalCases).where(eq(t.evalCases.workspaceId, workspaceId));
  }

  /**
   * Runs for a set of cases, newest first. Empty until the run route exists
   * (spec 13, R3) — the dashboard renders "never run" from exactly this.
   */
  async runsForCases(caseIds: string[], limit = 50): Promise<EvalRunRow[]> {
    if (caseIds.length === 0) return [];
    return this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(limit);
  }

  /**
   * The case already built from this finding, if any. `input_meta` is jsonb with
   * no index, so this filters in SQL on the columns that are indexed-ish
   * (workspace) and matches the finding id in JS — the per-workspace case count
   * is in the hundreds, not millions.
   */
  async findBySourceFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.workspaceId, workspaceId));
    return rows.find(
      (r) => {
        const meta = r.inputMeta as EvalCaseInputMeta | null;
        return !!meta && 'source_finding_id' in meta && meta.source_finding_id === findingId;
      },
    );
  }

  /** The agent's runnable definition. Read once per run so every case in a
      run is scored against the same provider/model/prompt (spec 13, R6). */
  async agent(workspaceId: string, agentId: string) {
    const [row] = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        provider: t.agents.provider,
        model: t.agents.model,
        systemPrompt: t.agents.systemPrompt,
        version: t.agents.version,
      })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row ?? null;
  }

  /** Linked skill bodies in `agent_skills.order` — the same order a review uses. */
  async skillBodies(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => r.body).filter((b): b is string => !!b);
  }

  async insertRun(values: {
    caseId: string;
    ranAt: Date;
    actualOutput: unknown;
    pass: boolean;
    recall: number;
    precision: number;
    citationAccuracy: number;
    durationMs: number;
    costUsd: number | null;
  }): Promise<EvalRunRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    return row!;
  }

  /** Agents that link this skill, in the order the Skills tab shows them. */
  async agentsLinkingSkill(
    workspaceId: string,
    skillId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));
  }

  async caseById(workspaceId: string, caseId: string): Promise<EvalCaseRow | null> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row ?? null;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    values: Partial<Pick<EvalCaseRow, 'name' | 'expectedOutput' | 'notes' | 'inputDiff'>>,
  ): Promise<EvalCaseRow | null> {
    const [row] = await this.db
      .update(t.evalCases)
      .set(values)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row ?? null;
  }

  /** `eval_runs.case_id` cascades, so a case's runs go with it. */
  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }
}
