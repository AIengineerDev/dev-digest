import type { Db } from '../../db/client.js';
import type { SkillRef, SkillSource } from '@devdigest/shared';
import { MAX_SKILLS_BLOCK_CHARS, UNTRUSTED_SKILL_SOURCES } from './constants.js';
import { assembleSkillBlocks, wrapUntrustedSkillBody } from './helpers.js';
import { SkillsRepository } from './repository.js';

/**
 * Resolves an agent's linked skills into the bodies that go into the review
 * prompt's `## Skills / rules` block.
 *
 * It lives in the skills module because the two rules it applies are the skills
 * module's own — the global `enabled` kill-switch and the per-assembly budget —
 * but it never reads `agent_skills`: the agents module owns the agent side of
 * the link and hands the ordered links in as values. That keeps the ownership
 * split of `specs/02-skills.md` intact in both directions.
 *
 * It is constructed in the composition root (`container.skills`) and reached
 * from the run executor through the container, not by importing across modules.
 * It takes a `Db`, never the container, so it adds no import cycle.
 */

/** One linked skill, in `agent_skills.order`, as the agents module reports it. */
export interface LinkedSkillInput {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  version: number;
  /**
   * Where the skill came from. Absent is read as 'manual' — the only sources
   * that change assembly are the untrusted ones, and a caller that does not know
   * the source is a caller working with workspace-authored skills.
   */
  source?: SkillSource;
}

/** What actually reached the prompt, and everything that did not. */
export interface AssembledSkills {
  /** Bodies to hand the engine, in order. Empty = no `## Skills / rules` block. */
  blocks: string[];
  /** `name@version` of every skill whose body is in `blocks`, in order. */
  used: string[];
  /** Names excluded because the skill is globally disabled. */
  disabled: string[];
  /** Names dropped from the END of the order by the assembly budget. */
  dropped: string[];
  /** Pinned refs whose skill (or snapshot) no longer exists. */
  unresolved: string[];
  /**
   * Human-readable lines for the run log — the caller writes them verbatim, so
   * the budget number is stated once, here, and a drop is never invisible.
   */
  notes: string[];
}

export class SkillAssembler {
  private repo: SkillsRepository;

  constructor(db: Db) {
    this.repo = new SkillsRepository(db);
  }

  /**
   * Live run: the agent's current links, at each skill's current body.
   *
   * Replay (`pinned` given, from an `agent_versions` snapshot): the snapshot's
   * own set and order win — a link added since the snapshot was written was not
   * part of that run — and each body comes from the pinned `skill_versions` row.
   * A pinned ref with `version: null` is a legacy snapshot that never recorded
   * one; it falls back to the current body, which is the honest best we have.
   */
  async assemble(
    workspaceId: string,
    links: LinkedSkillInput[],
    pinned?: SkillRef[] | null,
  ): Promise<AssembledSkills> {
    const resolved =
      pinned && pinned.length > 0
        ? await this.resolvePinned(workspaceId, pinned)
        : { candidates: links, unresolved: [] as string[] };

    const disabled = resolved.candidates.filter((s) => !s.enabled).map((s) => s.name);
    const enabled = resolved.candidates.filter((s) => s.enabled);

    const { blocks, droppedCount } = assembleSkillBlocks(
      enabled.map((s) => bodyFor(s)),
      MAX_SKILLS_BLOCK_CHARS,
    );
    const kept = enabled.slice(0, blocks.length);
    const dropped = enabled.slice(blocks.length).map((s) => s.name);
    const used = kept.map((s) => `${s.name}@${s.version}`);

    const notes: string[] = [];
    if (used.length > 0) {
      notes.push(`skills: ${used.length} block(s) assembled in order — ${used.join(', ')}`);
    } else {
      notes.push('skills: none assembled — no enabled skill is linked to this agent');
    }
    if (disabled.length > 0) {
      notes.push(`skills: ${disabled.length} linked skill(s) globally disabled, omitted — ${disabled.join(', ')}`);
    }
    if (droppedCount > 0) {
      notes.push(
        `skills: ${droppedCount} skill(s) dropped from the end of the order — the assembled block would exceed the ${MAX_SKILLS_BLOCK_CHARS}-character budget: ${dropped.join(', ')}`,
      );
    }
    if (resolved.unresolved.length > 0) {
      notes.push(
        `skills: ${resolved.unresolved.length} pinned skill(s) no longer resolve and were omitted — ${resolved.unresolved.join(', ')}`,
      );
    }

    return { blocks, used, disabled, dropped, unresolved: resolved.unresolved, notes };
  }

  /**
   * Turn pinned refs into candidate bodies. A ref that no longer resolves — the
   * skill was deleted, or that snapshot was never recorded — is reported, not
   * thrown: a replay losing one rule is a worse review, but failing the whole
   * run over a deleted skill loses the review entirely.
   */
  private async resolvePinned(
    workspaceId: string,
    pinned: SkillRef[],
  ): Promise<{ candidates: LinkedSkillInput[]; unresolved: string[] }> {
    const candidates: LinkedSkillInput[] = [];
    const unresolved: string[] = [];

    for (const ref of pinned) {
      const skill = await this.repo.getById(workspaceId, ref.id);
      if (!skill) {
        unresolved.push(`${ref.id} (deleted)`);
        continue;
      }
      if (ref.version === null) {
        // Legacy snapshot: no version was recorded, so the current body is the
        // only body we have. Never invent one.
        candidates.push({
          id: skill.id,
          name: skill.name,
          body: skill.body,
          enabled: skill.enabled,
          version: skill.version,
          source: skill.source as SkillSource,
        });
        continue;
      }
      const snapshot = await this.repo.getVersion(ref.id, ref.version);
      if (!snapshot) {
        unresolved.push(`${skill.name}@${ref.version} (no snapshot)`);
        continue;
      }
      candidates.push({
        id: skill.id,
        name: skill.name,
        body: snapshot.body,
        enabled: skill.enabled,
        version: snapshot.version,
        source: skill.source as SkillSource,
      });
    }

    return { candidates, unresolved };
  }
}

/**
 * The text that actually goes into the prompt for one skill: a label naming the
 * skill and the exact body version, then the body as written — unless it came
 * from outside the workspace, in which case the body is wrapped as untrusted
 * data. Both the label and the wrap count against the assembly budget, which is
 * correct: they are part of what the model reads.
 *
 * The label is not decoration. Without it the block is N bodies joined by blank
 * lines, each opening with its own `#` heading, so neither the model nor a
 * reader of the run trace can tell where one rule set ends and the next begins,
 * or which skill a rule came from. `skills_used` in the trace names them, but
 * only as a list beside the block — it cannot say which paragraph is whose.
 */
function bodyFor(skill: LinkedSkillInput): string {
  const untrusted = UNTRUSTED_SKILL_SOURCES.includes(
    skill.source as (typeof UNTRUSTED_SKILL_SOURCES)[number],
  );
  const body = untrusted ? wrapUntrustedSkillBody(skill.name, skill.body) : skill.body;
  return `${skillLabel(skill)}\n\n${body}`;
}

/**
 * One line, before every skill body.
 *
 * `---` first because a body may open at any heading level, so no heading can be
 * relied on to outrank it; a rule works regardless of what follows. The version
 * is included so a trace read months later says which snapshot ran, matching the
 * `name@version` form used in `used` and in the run notes.
 */
function skillLabel(skill: LinkedSkillInput): string {
  return `---\n**skill: ${skill.name}@${skill.version}**`;
}
