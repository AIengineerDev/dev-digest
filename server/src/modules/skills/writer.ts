import type { Db } from '../../db/client.js';
import type { CreateSkillInput, Skill, SkillSource } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { INITIAL_SKILL_VERSION, MAX_SKILL_BODY_CHARS } from './constants.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto } from './helpers.js';

/**
 * The one way a skill comes into existence.
 *
 * `SkillsService` is the HTTP-facing path, but another module (conventions,
 * promoting accepted candidates) also needs to create a skill, and it may not
 * import across module folders — `pnpm arch`'s `no-cross-module-internals`. The
 * documented way out is a small class that takes **`Db`, never `Container`**,
 * constructed in the composition root and reached as `container.skillsWriter`;
 * the same shape as `SkillAssembler`.
 *
 * Keeping creation here rather than duplicating it means one body limit, one
 * initial version, and one transaction: a skill row without its v1 snapshot has
 * no readable history and nothing backfills one.
 */
export interface CreateSkillOptions {
  /** Where the skill came from. Defaults to the repository's 'manual'. */
  source?: SkillSource;
  /** Files whose code produced this skill — set for extracted skills. */
  evidenceFiles?: string[];
}

export class SkillsWriter {
  private repo: SkillsRepository;

  constructor(private db: Db) {
    this.repo = new SkillsRepository(db);
  }

  async create(
    workspaceId: string,
    input: CreateSkillInput,
    opts: CreateSkillOptions = {},
  ): Promise<Skill> {
    this.assertBodyWithinLimit(input.body);

    const row = await this.db.transaction(async (tx) => {
      const created = await this.repo.insert(
        {
          workspaceId,
          name: input.name,
          description: input.description,
          type: input.type,
          body: input.body,
          enabled: input.enabled,
          version: INITIAL_SKILL_VERSION,
          ...(opts.source ? { source: opts.source } : {}),
          ...(opts.evidenceFiles ? { evidenceFiles: opts.evidenceFiles } : {}),
        },
        tx,
      );
      await this.repo.insertVersion(created.id, INITIAL_SKILL_VERSION, created.body, tx);
      return created;
    });

    return toSkillDto(row);
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
