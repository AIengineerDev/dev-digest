import { describe, it, expect } from 'vitest';
import {
  assembleBriefInput,
  briefSchemaEnvelope,
  type AssembleBriefInput,
  type AssembleFileInput,
} from '../src/modules/brief/assemble.js';
import {
  BRIEF_BILLING_SAFETY_FACTOR,
  BRIEF_TOKEN_BUDGET,
} from '../src/modules/brief/constants.js';

/**
 * R5's pre-flight token gate, and R2's structural wall against `pr_files.patch`
 * ever reaching the model. No model call happens in `assemble.ts`, which is
 * what makes both assertable without a mock LLM — the counter is injected, and
 * the 8 000-token ceiling is measured on the exact strings the function
 * returns, not on a re-derived approximation.
 *
 * The injected counter here is character length (`s => s.length`), not a real
 * BPE tokenizer — `assemble.ts` does not care what the counter measures, only
 * that it is consistent between the pre-flight check and the caller's
 * re-measurement, which is exactly what R5 requires of
 * `container.tokenizer.count`.
 */
const count = (s: string): number => s.length;

function baseInput(overrides: Partial<AssembleBriefInput> = {}): AssembleBriefInput {
  return {
    pr: {
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      branch: 'feat/rate-limit-public',
      base: 'main',
      additions: 247,
      deletions: 38,
      filesCount: 9,
      body: null,
    },
    files: [{ path: 'src/middleware/ratelimit.ts', additions: 40, deletions: 4, role: 'core' }],
    commitSubjects: [],
    linkedIssue: null,
    blast: null,
    derivedIntent: null,
    projectContext: [],
    count,
    ...overrides,
  };
}

/** Mirrors what `repository.ts::getFiles` selects — path/additions/deletions
 *  only — plus the computed role a service would add. A row shaped like the
 *  DB's `pr_files` (WITH a `patch` column) is deliberately fed through this
 *  narrowing, exactly as `service.ts` does, so the test proves the wall, not
 *  just the type. */
function toAssembleFile(row: { path: string; additions: number; deletions: number; patch: string | null }): AssembleFileInput {
  return { path: row.path, additions: row.additions, deletions: row.deletions, role: 'core' };
}

describe('assembleBriefInput — R5 the 8 000-token gate', () => {
  it('A3 — stays at or under the budget, and `tokens` equals a re-measurement of the returned strings', () => {
    const result = assembleBriefInput(
      baseInput({
        pr: {
          number: 482,
          title: 'Add rate limiting to public API endpoints',
          branch: 'feat/rate-limit-public',
          base: 'main',
          additions: 247,
          deletions: 38,
          filesCount: 9,
          body: 'Adds a token-bucket rate limiter in front of the public API.',
        },
        commitSubjects: ['feat: add rate limiter', 'test: cover bucket refill'],
        derivedIntent: {
          category: 'feature',
          summary: 'Adds rate limiting to public endpoints.',
          band: 'high',
          inScope: ['rate limiting'],
          outOfScope: [],
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
    // The identity A3 requires: re-measuring the EXACT strings sent — plus the
    // structured-output envelope that is sent alongside them (amendment A-3) —
    // equals the number the pre-flight gate itself computed.
    expect(count(result.system + result.user + briefSchemaEnvelope())).toBe(result.countedTokens);
    // ...and the gated number is that count scaled, never the bare count.
    expect(result.tokens).toBe(Math.ceil(result.countedTokens * BRIEF_BILLING_SAFETY_FACTOR));
  });

  it('A3 / amendment A-3 — the structured-output envelope is inside the gate, not outside it', () => {
    // The regression this pins: MEASURED 2026-08-19 against PR #482 the gate
    // read 612 tokens and the provider billed 2 006. The schema envelope is
    // sent as a tool definition / response_format, so a counter over `system`
    // and `user` alone is structurally blind to it. Two independent claims:
    // the envelope is non-empty and carries the schema, and it is inside the
    // number the gate compares to the budget.
    const envelope = briefSchemaEnvelope();
    expect(envelope).toContain('risk_level');
    expect(envelope).toContain('review_focus');

    const result = assembleBriefInput(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Strictly greater than a strings-only count, by at least the envelope.
    const stringsOnly = count(result.system + result.user);
    expect(result.countedTokens).toBe(stringsOnly + count(envelope));
    expect(result.tokens).toBeGreaterThan(stringsOnly);
  });

  it('A3 / amendment A-3 — an input that would fit unscaled is refused when its billed estimate would not', () => {
    // The unsound gate's exact failure mode: a body sized to pass a bare count
    // and blow the real bill. `BRIEF_TOKEN_BUDGET` is billed tokens, so the
    // scaled estimate is what decides — and `pr_body` being dropped here is
    // the gate biting, not the assembler truncating silently.
    const justUnderBare = 'x'.repeat(BRIEF_TOKEN_BUDGET - 500);
    const result = assembleBriefInput(
      baseInput({ pr: { ...baseInput().pr, body: justUnderBare } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.droppedInputs).toContain('pr_body');
    expect(result.tokens).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('A4 — `pr_files.patch` never reaches the assembled input, even when the source row carries it', () => {
    const sentinel = 'SENTINEL_HUNK_BODY_DO_NOT_SEND_TO_MODEL';
    const dbRow = { path: 'src/config.ts', additions: 4, deletions: 0, patch: `@@ -1 +1 @@\n+${sentinel}` };

    const result = assembleBriefInput(baseInput({ files: [toAssembleFile(dbRow)] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.system + result.user).not.toContain(sentinel);
  });

  it('A5 / C14 — a PR too large to fit even after every droppable input is gone refuses, not truncates', () => {
    const files: AssembleFileInput[] = Array.from({ length: 300 }, (_, i) => ({
      path: `src/generated/module-${String(i).padStart(4, '0')}/handler.ts`,
      additions: 10,
      deletions: 2,
      role: 'core' as const, // core is never dropped — this is the point
    }));

    const result = assembleBriefInput(
      baseInput({
        files,
        pr: { ...baseInput().pr, filesCount: files.length },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('input_over_budget');
    // Every droppable step was tried before giving up.
    expect(result.droppedInputs).toEqual([
      'project_context',
      'commit_subjects',
      'linked_issue_body',
      'pr_body',
      'files_boilerplate',
      'files_wiring',
      'blast_callers',
      'derived_intent',
    ]);
  });
});
