/**
 * Pure input assembly (R2, R5, R7): turns the brief's fetched inputs into the
 * EXACT `{ system, user }` pair a model call would receive, gates it at
 * `BRIEF_TOKEN_BUDGET` by an injected counter, and never makes a model call —
 * that is what makes the 8 000-token ceiling assertable in a hermetic test
 * (`test/brief-budget.test.ts`).
 *
 * Domain: no `Container`, no `Db`, no adapter import. The tokenizer is taken
 * as an injected `count: (s: string) => number`, never as `container.tokenizer`
 * — see `server/INSIGHTS.md` (2026-08-09, "do not copy agents/helpers.ts's row
 * types") for the structural-typing trick this file also uses for its inputs.
 *
 * R2's structural wall: `AssembleFileInput` has no member a patch could
 * occupy. A future implementer who wants to pass hunk bodies has to widen this
 * exported signature — a visible, reviewable act.
 */
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { SmartDiffRole } from '@devdigest/shared';
import { normalizePath } from '../_shared/file-roles.js';
import {
  BRIEF_DROP_ORDER,
  BRIEF_INJECTION_GUARD,
  MAX_COMMIT_SUBJECTS,
  MAX_COMMIT_SUBJECT_CHARS,
  MAX_PR_BODY_CHARS,
  BRIEF_TOKEN_BUDGET,
  type BriefDropStep,
} from './constants.js';

// ---------------------------------------------------------------------------
// Blast shaping — brief's own equivalent of `modules/blast/helpers.ts`'s
// `toBlastRadius`. Not imported from there: `modules/brief/` may not reach
// into `modules/blast/` (`no-cross-module-internals`), and the shape this
// prompt needs (prose summary + a droppable callers block) is narrower than
// the `BlastRadius` contract. Structurally typed against the repo-intel
// facade's raw `BlastResult`, same trick as `blast/helpers.ts:BlastResultLike`.
// ---------------------------------------------------------------------------

export interface BlastResultLike {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number }[];
  impactedEndpoints: string[];
  degraded?: boolean;
}

export interface ShapedBlast {
  summary: string;
  changedSymbols: { name: string; file: string; kind: string }[];
  /** Never dropped (R4's reference set) — kept separate from `callersText`. */
  endpointsAffected: string[];
  /** Droppable prose block; `null` when there is nothing to render. */
  callersText: string | null;
}

export function shapeBlastForBrief(result: BlastResultLike): ShapedBlast {
  const endpointsAffected = [...new Set(result.impactedEndpoints)];
  const summary =
    result.changedSymbols.length === 0
      ? result.degraded
        ? 'No indexed symbols for the changed files. The repo index is unavailable, so this is a floor, not a finding.'
        : 'No exported symbols changed — the diff touches no declaration the index knows about.'
      : `${result.changedSymbols.length} changed symbol${result.changedSymbols.length === 1 ? '' : 's'}, ` +
        `${result.callers.length} caller${result.callers.length === 1 ? '' : 's'}, ` +
        `${endpointsAffected.length} endpoint${endpointsAffected.length === 1 ? '' : 's'} affected.` +
        (result.degraded ? ' Index degraded: callers are best-effort and endpoint attribution is approximate.' : '');
  const callersText =
    result.callers.length > 0
      ? result.callers.map((c) => `${c.file}:${c.line} calls ${c.viaSymbol} (via ${c.symbol})`).join('\n')
      : null;
  return {
    summary,
    changedSymbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    endpointsAffected,
    callersText,
  };
}

// ---------------------------------------------------------------------------
// Assembly input/output
// ---------------------------------------------------------------------------

/** R2's first structural wall's other half: no member here could ever hold a
 *  hunk body — the caller (the repository) selects only these three columns
 *  plus the computed `role`. */
export interface AssembleFileInput {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly role: SmartDiffRole;
}

export interface AssembleLinkedIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

export interface AssembleDerivedIntent {
  readonly category: string;
  readonly summary: string;
  readonly band: 'high' | 'medium' | 'low';
  readonly inScope: readonly string[];
  readonly outOfScope: readonly string[];
}

export interface AssembleBriefInput {
  readonly pr: {
    readonly number: number;
    readonly title: string;
    readonly branch: string;
    readonly base: string;
    readonly additions: number;
    readonly deletions: number;
    readonly filesCount: number;
    readonly body: string | null;
  };
  readonly files: readonly AssembleFileInput[];
  readonly commitSubjects: readonly string[];
  readonly linkedIssue: AssembleLinkedIssue | null;
  readonly blast: ShapedBlast | null;
  readonly derivedIntent: AssembleDerivedIntent | null;
  /** Input slot 10 (project-context documents) — always `[]` today; the spec
   *  that would populate it (`specs/09-project-context.md`) is unbuilt (Q2). */
  readonly projectContext: readonly string[];
  /** Injected token counter — `container.tokenizer.count` at the call site,
   *  a stub in tests. Never imported from `src/adapters/` here. */
  readonly count: (text: string) => number;
}

export type AssembleResult =
  | {
      readonly ok: true;
      readonly system: string;
      readonly user: string;
      /** `count(system + user)` on the strings actually returned — the
       *  identity A3's test asserts against a re-measurement. */
      readonly tokens: number;
      readonly droppedInputs: string[];
      /** Changed-file paths retained in the assembly after any drop —
       *  R4's reference set is built from THIS, not from the database, so a
       *  dropped `boilerplate` file correctly stops being a valid ref. */
      readonly filesUsed: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'input_over_budget';
      readonly droppedInputs: string[];
    };

interface AssembleState {
  projectContext: boolean;
  commitSubjects: boolean;
  linkedIssueBody: boolean;
  prBody: boolean;
  filesBoilerplate: boolean;
  filesWiring: boolean;
  blastCallers: boolean;
  derivedIntent: boolean;
}

function initialState(): AssembleState {
  return {
    projectContext: true,
    commitSubjects: true,
    linkedIssueBody: true,
    prBody: true,
    filesBoilerplate: true,
    filesWiring: true,
    blastCallers: true,
    derivedIntent: true,
  };
}

const STEP_APPLIERS: Record<BriefDropStep, (s: AssembleState) => void> = {
  project_context: (s) => (s.projectContext = false),
  commit_subjects: (s) => (s.commitSubjects = false),
  linked_issue_body: (s) => (s.linkedIssueBody = false),
  pr_body: (s) => (s.prBody = false),
  files_boilerplate: (s) => (s.filesBoilerplate = false),
  files_wiring: (s) => (s.filesWiring = false),
  blast_callers: (s) => (s.blastCallers = false),
  derived_intent: (s) => (s.derivedIntent = false),
};

function filesUsedFor(input: AssembleBriefInput, state: AssembleState): string[] {
  return input.files
    .filter(
      (f) =>
        f.role === 'core' ||
        (f.role === 'wiring' && state.filesWiring) ||
        (f.role === 'boilerplate' && state.filesBoilerplate),
    )
    .map((f) => normalizePath(f.path));
}

function renderFilesBlock(input: AssembleBriefInput, state: AssembleState): string | null {
  const groups: { label: string; role: SmartDiffRole; on: boolean }[] = [
    { label: 'Core', role: 'core', on: true },
    { label: 'Wiring', role: 'wiring', on: state.filesWiring },
    { label: 'Boilerplate', role: 'boilerplate', on: state.filesBoilerplate },
  ];
  const lines: string[] = [];
  for (const g of groups) {
    if (!g.on) continue;
    const files = input.files.filter((f) => f.role === g.role);
    if (files.length === 0) continue;
    lines.push(`${g.label}:`);
    for (const f of files) lines.push(`- ${f.path} (+${f.additions}/-${f.deletions})`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

function renderBlastBlock(blast: ShapedBlast, state: AssembleState): string {
  const lines = [blast.summary];
  if (blast.changedSymbols.length > 0) {
    lines.push('Changed symbols:');
    for (const s of blast.changedSymbols) lines.push(`- ${s.name} (${s.kind}) in ${s.file}`);
  }
  if (blast.endpointsAffected.length > 0) {
    lines.push(`Endpoints affected: ${blast.endpointsAffected.join(', ')}`);
  }
  if (state.blastCallers && blast.callersText) {
    lines.push('Callers:');
    lines.push(blast.callersText);
  }
  return lines.join('\n');
}

function renderDerivedIntentBlock(intent: AssembleDerivedIntent): string {
  const parts = [`Category: ${intent.category}`, `Summary: ${intent.summary}`];
  if (intent.inScope.length > 0) parts.push(`In scope:\n${intent.inScope.map((s) => `- ${s}`).join('\n')}`);
  if (intent.outOfScope.length > 0) {
    parts.push(`Out of scope:\n${intent.outOfScope.map((s) => `- ${s}`).join('\n')}`);
  }
  return parts.join('\n');
}

function tailSlice(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(text.length - maxChars) : text;
}

function boundedSubjects(subjects: readonly string[]): string[] {
  return subjects
    .slice(0, MAX_COMMIT_SUBJECTS)
    .map((s) => (s.length > MAX_COMMIT_SUBJECT_CHARS ? s.slice(0, MAX_COMMIT_SUBJECT_CHARS - 1) + '…' : s));
}

const SYSTEM_PROMPT = [
  'You assess merge risk for a pull request, from the signals given below — never from the diff itself.',
  '',
  'Return a JSON object shaped exactly:',
  '{ what: string, why: string, risk_level: "low"|"medium"|"high", risks: [{ kind, title, explanation, severity, file_refs: string[] }], review_focus: [{ kind: "file"|"endpoint", ref: string, reason: string, line?: number }] }',
  '',
  'Rules:',
  '1. GROUNDED — every `file_refs` entry and every `review_focus.ref` MUST be either a path listed under',
  '   "## Changed files" or an endpoint string listed under "## Blast radius". A ref naming anything else',
  '   is dropped before it ever reaches a reviewer, so an invented ref wastes the entire finding.',
  '2. CONCISE — `what`/`why` are one or two sentences each, not paragraphs.',
  '3. `review_focus` is ordered — put what a reviewer should read FIRST, first.',
  '4. `risks: []` and `review_focus: []` are valid, honest answers for a low-risk change. Do not invent',
  '   risk to fill the list.',
  '',
  BRIEF_INJECTION_GUARD,
].join('\n');

/**
 * Assemble `{ system, user }`, gate at `BRIEF_TOKEN_BUDGET`, dropping inputs in
 * `BRIEF_DROP_ORDER` until it fits or every droppable input is gone. No model
 * call is made here.
 */
export function assembleBriefInput(input: AssembleBriefInput): AssembleResult {
  const state = initialState();
  const droppedInputs: string[] = [];

  const render = (): { system: string; user: string } => {
    const sections: string[] = [];
    sections.push(
      `## PR\n#${input.pr.number} · ${input.pr.branch} → ${input.pr.base} · ` +
        `+${input.pr.additions}/-${input.pr.deletions} (${input.pr.filesCount} files)`,
    );
    sections.push(`## PR title\n${wrapUntrusted('pr-title', input.pr.title)}`);

    if (state.prBody && input.pr.body && input.pr.body.trim().length > 0) {
      sections.push(`## PR description\n${wrapUntrusted('pr-description', tailSlice(input.pr.body, MAX_PR_BODY_CHARS))}`);
    }

    if (input.linkedIssue) {
      let block = `## Linked issue #${input.linkedIssue.number}\n${wrapUntrusted('linked-issue-title', input.linkedIssue.title)}`;
      if (state.linkedIssueBody && input.linkedIssue.body.trim().length > 0) {
        block += `\n\n${wrapUntrusted('linked-issue-body', input.linkedIssue.body)}`;
      }
      sections.push(block);
    }

    if (state.commitSubjects && input.commitSubjects.length > 0) {
      const subjects = boundedSubjects(input.commitSubjects);
      sections.push(`## Commit subjects\n${wrapUntrusted('commit-subjects', subjects.map((s) => `- ${s}`).join('\n'))}`);
    }

    const filesBlock = renderFilesBlock(input, state);
    if (filesBlock) sections.push(`## Changed files\n${filesBlock}`);

    if (input.blast) sections.push(`## Blast radius\n${renderBlastBlock(input.blast, state)}`);

    if (state.derivedIntent && input.derivedIntent) {
      sections.push(`## Derived intent\n${wrapUntrusted('derived-intent', renderDerivedIntentBlock(input.derivedIntent))}`);
    }

    if (state.projectContext && input.projectContext.length > 0) {
      sections.push(
        `## Project context\n${input.projectContext.map((c, i) => wrapUntrusted(`project-context-${i}`, c)).join('\n\n')}`,
      );
    }

    return { system: SYSTEM_PROMPT, user: sections.join('\n\n') };
  };

  let { system, user } = render();
  let tokens = input.count(system + user);

  if (tokens <= BRIEF_TOKEN_BUDGET) {
    return { ok: true, system, user, tokens, droppedInputs, filesUsed: filesUsedFor(input, state) };
  }

  for (const step of BRIEF_DROP_ORDER) {
    STEP_APPLIERS[step](state);
    droppedInputs.push(step);
    ({ system, user } = render());
    tokens = input.count(system + user);
    if (tokens <= BRIEF_TOKEN_BUDGET) {
      return { ok: true, system, user, tokens, droppedInputs, filesUsed: filesUsedFor(input, state) };
    }
  }

  return { ok: false, reason: 'input_over_budget', droppedInputs };
}
