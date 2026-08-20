import type { GitClient, RepoRef, SpecUsed } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { WINDOW_FRACTION } from './constants.js';
import { mergeAttachmentsByPath, splitByBudget, toSpecUsed } from './helpers.js';
import type { AttachmentRow } from './repository.js';

/**
 * Resolves an agent's attached project-context documents (its own attachments
 * plus its enabled linked skills') into the exact blocks a run will inject.
 *
 * Same shape as `skills/assembler.ts`'s `SkillAssembler` — constructed here in
 * the container as `container.projectContext`, and never reads `agent_skills`
 * itself, the caller (the review run executor) already resolved the agent's
 * linked skills for its own reasons and hands the ids (and names, and
 * `enabled`) in as values.
 *
 * One deliberate difference from `SkillAssembler`: it takes an
 * `AttachmentSource` (the narrow read this class needs), not a raw `Db` it
 * would build its own repository from. `SkillAssembler`'s only test is
 * DB-backed (`test/skills-assembly.it.test.ts`); plan A4 requires a hermetic
 * one (C11 dedup, C12 tail-drop, C14 disabled-skill filtering), which a
 * `Db`-only constructor cannot support without Postgres. The container still
 * passes the real `ProjectContextRepository`; tests pass a stub.
 */

/** The narrow read `ProjectContextAssembler` needs — `ProjectContextRepository`
 *  satisfies it structurally; tests can pass a stub instead. */
export interface AttachmentSource {
  attachmentsForTargets(
    repoId: string,
    targets: Array<{ kind: 'agent' | 'skill'; id: string }>,
  ): Promise<AttachmentRow[]>;
}

export interface ProjectContextTarget {
  kind: 'agent' | 'skill';
  id: string;
  /** Skill display name — builds the `skill:<name>` source label (R6, C11).
   *  Unused for the agent target (its label is the fixed string `'agent'`). */
  name?: string;
  /** Skills only. A globally disabled skill contributes nothing (C14),
   *  matching the hard-off rule the skills assembler already applies. */
  enabled?: boolean;
}

export interface AssembledProjectContext {
  /** `{source, text}[]` — exactly `ReviewInput.specs`'s shape. Empty = no
   *  `## Project context` block. */
  blocks: Array<{ source: string; text: string }>;
  /** Per-document attribution, `injected` | `dropped` | `skipped` — what the
   *  trace's `specs_used` persists verbatim. */
  used: SpecUsed[];
  /** Human-readable lines for the run log — the caller writes them verbatim. */
  notes: string[];
}

export class ProjectContextAssembler {
  constructor(
    private repo: AttachmentSource,
    private git: GitClient,
    private tokenizer: Tokenizer,
    /** `adapters/llm/pricing.ts`'s `resolveContextWindow`, injected rather than
     *  imported — `injected-adapters-only-from-container` forbids a module
     *  reaching into `adapters/llm/*` directly. */
    private resolveWindow: (model: string, providerContextLength?: number | null) => number,
  ) {}

  async assemble(
    repo: RepoRef,
    repoId: string,
    targets: ProjectContextTarget[],
    model: string,
    providerContextLength?: number | null,
  ): Promise<AssembledProjectContext> {
    const disabledSkillNames = targets
      .filter((t) => t.kind === 'skill' && t.enabled === false)
      .map((t) => t.name ?? t.id);
    const active = targets.filter((t) => t.kind === 'agent' || t.enabled !== false);

    const notes: string[] = [];

    if (active.length === 0) {
      notes.push(...disabledNote(disabledSkillNames));
      return { blocks: [], used: [], notes };
    }

    const labelFor = new Map<string, string>();
    for (const t of active) {
      labelFor.set(`${t.kind}:${t.id}`, t.kind === 'agent' ? 'agent' : `skill:${t.name ?? t.id}`);
    }

    const rows = await this.repo.attachmentsForTargets(
      repoId,
      active.map((t) => ({ kind: t.kind, id: t.id })),
    );
    const merged = mergeAttachmentsByPath(
      rows,
      (row) => labelFor.get(`${row.targetKind}:${row.targetId}`) ?? row.targetKind,
    );

    if (merged.length === 0) {
      notes.push('project context: none assembled — no document is attached');
      notes.push(...disabledNote(disabledSkillNames));
      return { blocks: [], used: [], notes };
    }

    // Read + count every attached document once, in attachment order — a
    // document unreadable at run time (deleted clone entry, permissions) is
    // skipped, never fails the run (R4, R10, C7).
    const candidates: Array<{ path: string; sources: string[]; tokens: number; text: string }> = [];
    const skipped: SpecUsed[] = [];

    for (const doc of merged) {
      let text: string;
      try {
        text = await this.git.readFile(repo, doc.path);
      } catch {
        skipped.push(toSpecUsed(doc.path, doc.sources, 0, 'skipped'));
        notes.push(`project context: '${doc.path}' is unreadable and was skipped`);
        continue;
      }
      candidates.push({ path: doc.path, sources: doc.sources, tokens: this.tokenizer.count(text), text });
    }

    const budgetTokens = Math.floor(this.resolveWindow(model, providerContextLength) * WINDOW_FRACTION);
    const { kept, dropped } = splitByBudget(
      candidates.map((c) => ({ path: c.path, sources: c.sources, tokens: c.tokens })),
      budgetTokens,
    );

    const textFor = new Map(candidates.map((c) => [c.path, c.text]));
    const blocks = kept.map((k) => ({ source: k.path, text: textFor.get(k.path)! }));

    const used: SpecUsed[] = [
      ...kept.map((k) => toSpecUsed(k.path, k.sources, k.tokens, 'injected')),
      ...dropped.map((d) => toSpecUsed(d.path, d.sources, d.tokens, 'dropped')),
      ...skipped,
    ];

    if (kept.length > 0) {
      notes.push(
        `project context: ${kept.length} document(s) assembled in order — ${kept.map((k) => k.path).join(', ')}`,
      );
    } else {
      notes.push('project context: none assembled — every attached document was dropped or unreadable');
    }
    if (dropped.length > 0) {
      notes.push(
        `project context: ${dropped.length} document(s) dropped from the end of the order — the assembled block would exceed the ${budgetTokens}-token budget (${Math.round(WINDOW_FRACTION * 100)}% of the resolved window): ${dropped.map((d) => d.path).join(', ')}`,
      );
    }
    notes.push(...disabledNote(disabledSkillNames));

    return { blocks, used, notes };
  }
}

function disabledNote(names: string[]): string[] {
  if (names.length === 0) return [];
  return [
    `project context: ${names.length} linked skill(s) globally disabled, attachments omitted — ${names.join(', ')}`,
  ];
}
