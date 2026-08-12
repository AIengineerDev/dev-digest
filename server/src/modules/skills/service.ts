import type { Container } from '../../platform/container.js';
import type { Db } from '../../db/client.js';
import type {
  CreateSkillInput,
  ImportSkillFileInput,
  ImportSkillInput,
  Skill,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { INITIAL_SKILL_VERSION, MAX_SKILL_BODY_CHARS } from './constants.js';
import { SkillsRepository, type ListSkillsFilter } from './repository.js';
import { SkillsWriter } from './writer.js';
import { SkillImporter } from './importer.js';
import { isBodyChange, toSkillDto, toSkillVersionDto } from './helpers.js';

/**
 * Skills service. A skill is a named, versioned block of review guidance that
 * lives independently of any agent, so it owns two rules the repository does not:
 *
 * - the per-skill body budget, enforced on write (rejecting an oversized body is
 *   better than silently truncating it in the prompt), and
 * - the versioning rule: a *body* change bumps `version` and appends a
 *   `skill_versions` snapshot; renaming or toggling `enabled` does not.
 *
 * Both create and update span two tables, so this layer owns the transaction
 * boundary and hands the repository the executor.
 */

export type { ListSkillsFilter } from './repository.js';

export class SkillsService {
  private repo: SkillsRepository;
  private writer: SkillsWriter;
  private importer: SkillImporter;
  private db: Db;

  constructor(container: Container) {
    this.db = container.db;
    this.repo = new SkillsRepository(container.db);
    this.writer = new SkillsWriter(container.db);
    this.importer = new SkillImporter(this.writer);
  }

  async list(workspaceId: string, filter: ListSkillsFilter = {}): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId, filter);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Create the skill at version 1 and record its first body snapshot, in one
   * transaction. Delegated to `SkillsWriter` because the conventions module
   * creates skills too and may not import this service — one implementation, so
   * the body limit and the v1 snapshot cannot diverge between the two paths.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return this.writer.create(workspaceId, input);
  }

  /**
   * Fetch a skill body from a URL and store it as `source: 'imported_url'`,
   * which is what makes the assembler wrap it as untrusted. Everything the
   * importer refuses (non-http, internal host, oversized, empty) surfaces as a
   * 422, not a 500: they are all statements about the caller's URL.
   */
  async importFromUrl(workspaceId: string, input: ImportSkillInput): Promise<Skill> {
    return this.importer.importFromUrl(workspaceId, input);
  }

  /**
   * Store a file the client read from the user's disk as `source:
   * 'imported_file'` — untrusted for the same reason a URL import is, since
   * selecting a document is not the same as having written it.
   */
  async importFromFile(workspaceId: string, input: ImportSkillFileInput): Promise<Skill> {
    return this.importer.importFromFile(workspaceId, input);
  }

  /**
   * Apply a patch. Read-modify-write, so the whole thing is one transaction: the
   * read decides the next version, and two concurrent body edits outside a
   * transaction would both read the same version and collide on the snapshot.
   *
   * Returns undefined when the skill is not in this workspace (route → 404).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    if (patch.body !== undefined) this.assertBodyWithinLimit(patch.body);

    const row = await this.db.transaction(async (tx) => {
      const existing = await this.repo.getById(workspaceId, id, tx);
      if (!existing) return undefined;

      const bodyChanged = isBodyChange(existing, patch);
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      const updated = await this.repo.update(
        workspaceId,
        id,
        { ...patch, ...(bodyChanged ? { version: nextVersion } : {}) },
        tx,
      );

      if (bodyChanged && updated) {
        await this.repo.insertVersion(updated.id, nextVersion, updated.body, tx);
      }
      return updated;
    });

    return row ? toSkillDto(row) : undefined;
  }

  /** Hard delete; versions and agent links cascade. False = no such skill here. */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: undefined
   * when the skill isn't in this workspace, so snapshots can't be read across
   * tenants by guessing an id.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * A single body snapshot. Undefined when the skill isn't in this workspace OR
   * that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /** The error names the limit and the actual size — "too long" is not actionable. */
  private assertBodyWithinLimit(body: string): void {
    if (body.length > MAX_SKILL_BODY_CHARS) {
      throw new ValidationError(
        `Skill body is ${body.length} characters; the limit is ${MAX_SKILL_BODY_CHARS}.`,
        { limit: MAX_SKILL_BODY_CHARS, actual: body.length },
      );
    }
  }
}
