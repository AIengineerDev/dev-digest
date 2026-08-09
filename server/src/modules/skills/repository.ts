import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { DEFAULT_SKILL_SOURCE } from './constants.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`.
 *
 * It does NOT touch `agent_skills`: the agents module owns the agent side of
 * that link (link/reorder/list for an agent), and neither module reaches into
 * the other's tables. Deleting a skill drops its links through the FK cascade,
 * not through a write from here.
 *
 * Every method takes an executor, so the service can compose several writes into
 * one transaction; it never opens one itself.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  source?: SkillSource;
  version: number;
  /** Files whose code produced this skill; set by extraction, null otherwise. */
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Set only when the body changed; omitted leaves `version` untouched. */
  version?: number;
}

export interface ListSkillsFilter {
  type?: SkillType;
  enabled?: boolean;
  /** Free-text match against name and description. */
  q?: string;
}

/**
 * Either the pooled client or an open transaction. Drizzle gives `tx` the same
 * query surface as `db`, so every read/write below takes an executor and works
 * unchanged inside or outside a transaction.
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

/** Postgres SQLSTATE classes we can state a domain meaning for. */
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_NOT_NULL_VIOLATION = '23502';

/**
 * Translate a driver error into the domain taxonomy. Constraint violations are
 * the database restating a rule the caller broke, so they surface as
 * `ValidationError` (422) rather than an unhandled 500; anything else is a real
 * fault and is rethrown untouched.
 */
function translateDbError(err: unknown): never {
  const code = (err as { code?: string } | null)?.code;
  if (
    code === PG_FOREIGN_KEY_VIOLATION ||
    code === PG_UNIQUE_VIOLATION ||
    code === PG_CHECK_VIOLATION ||
    code === PG_NOT_NULL_VIOLATION
  ) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ValidationError(message, { code });
  }
  throw err;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(
    workspaceId: string,
    filter: ListSkillsFilter = {},
    exec: Executor = this.db,
  ): Promise<SkillRow[]> {
    const conditions: SQL[] = [eq(t.skills.workspaceId, workspaceId)];
    if (filter.type !== undefined) conditions.push(eq(t.skills.type, filter.type));
    if (filter.enabled !== undefined) conditions.push(eq(t.skills.enabled, filter.enabled));
    if (filter.q !== undefined && filter.q !== '') {
      const pattern = `%${filter.q}%`;
      conditions.push(
        or(ilike(t.skills.name, pattern), ilike(t.skills.description, pattern)) as SQL,
      );
    }
    return exec
      .select()
      .from(t.skills)
      .where(and(...conditions))
      .orderBy(t.skills.name);
  }

  async getById(
    workspaceId: string,
    id: string,
    exec: Executor = this.db,
  ): Promise<SkillRow | undefined> {
    const [row] = await exec
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Insert the skill row only. The caller must also write the matching
   * `skill_versions` snapshot inside the same transaction — a skill whose body
   * has no snapshot cannot be replayed, and nothing later re-creates it.
   */
  async insert(values: InsertSkill, exec: Executor = this.db): Promise<SkillRow> {
    try {
      const [row] = await exec
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source ?? DEFAULT_SKILL_SOURCE,
          body: values.body,
          enabled: values.enabled ?? true,
          version: values.version,
          ...(values.evidenceFiles ? { evidenceFiles: values.evidenceFiles } : {}),
        })
        .returning();
      return row!;
    } catch (err) {
      translateDbError(err);
    }
  }

  /** Apply a patch. Returns undefined when the skill is not in this workspace. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    exec: Executor = this.db,
  ): Promise<SkillRow | undefined> {
    try {
      const [row] = await exec
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.version !== undefined ? { version: patch.version } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      return row;
    } catch (err) {
      translateDbError(err);
    }
  }

  /** Hard delete. `skill_versions` and `agent_skills` go with it, by cascade. */
  async deleteById(workspaceId: string, id: string, exec: Executor = this.db): Promise<boolean> {
    const rows = await exec
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /**
   * Append a body snapshot. Deliberately NOT `onConflictDoNothing`: a duplicate
   * (skill_id, version) means the version counter and the history disagree, and
   * swallowing it would leave the snapshot silently missing.
   */
  async insertVersion(
    skillId: string,
    version: number,
    body: string,
    exec: Executor = this.db,
  ): Promise<void> {
    try {
      await exec.insert(t.skillVersions).values({ skillId, version, body });
    } catch (err) {
      translateDbError(err);
    }
  }

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string, exec: Executor = this.db): Promise<SkillVersionRow[]> {
    return exec
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** One snapshot, or undefined if that version was never recorded. */
  async getVersion(
    skillId: string,
    version: number,
    exec: Executor = this.db,
  ): Promise<SkillVersionRow | undefined> {
    const [row] = await exec
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }
}
