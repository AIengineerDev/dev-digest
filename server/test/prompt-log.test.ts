import { describe, it, expect } from 'vitest';
import { describePromptSections } from '../src/modules/reviews/prompt-log.js';
import type { PromptAssembly } from '@devdigest/shared';

/**
 * `specs/02-skills.md` acceptance #4 — a review run by an agent with linked
 * skills shows a non-null `skills` slot in the Run Trace, WITH the token
 * count attributed to it.
 *
 * `describePromptSections` is the one counter in the codebase (per
 * `INSIGHTS.md`, "reuse the counting" — no second estimator). Historically it
 * only tokenised when a `countTokens` fn was passed, which `run-executor.ts`
 * gated on `config.promptLogVerbose`. The run trace needs the count on every
 * run, so the executor now always passes a counter — this test pins the pure
 * function's contract that makes that safe: whenever a counter is supplied,
 * every populated section — including `skills` — gets a `tokens` figure, with
 * no dependency on a "verbose" concept the function itself has never had.
 */

const BASE: PromptAssembly = {
  system: 'You are a reviewer.',
  skills: null,
  memory: null,
  specs: null,
  callers: null,
  repo_map: null,
  pr_description: null,
  intent: null,
  skills_used: null,
  skills_tokens: null,
  correlation_id: null,
  user: 'Review this diff.',
};

const countTokens = (text: string) => Math.ceil(text.length / 4);

describe('describePromptSections — token attribution', () => {
  it('attributes a token count to the skills section when a counter is supplied', () => {
    const assembly: PromptAssembly = {
      ...BASE,
      skills: '## skill: rule-one\nAlways name the limit.',
      user: '## Skills / rules\n## skill: rule-one\nAlways name the limit.\nReview this diff.',
    };
    const stats = describePromptSections(assembly, countTokens);
    const skillsStat = stats.find((s) => s.section === 'skills');
    expect(skillsStat).toBeDefined();
    expect(skillsStat!.tokens).toBe(countTokens(assembly.skills!));
    expect(skillsStat!.tokens).toBeGreaterThan(0);
  });

  it('omits the skills section entirely when there is no skills text (never a fabricated 0)', () => {
    const stats = describePromptSections(BASE, countTokens);
    expect(stats.find((s) => s.section === 'skills')).toBeUndefined();
  });

  it('leaves tokens undefined for every section when no counter is supplied', () => {
    const assembly: PromptAssembly = {
      ...BASE,
      skills: '## skill: rule-one\nAlways name the limit.',
      user: '## Skills / rules\n## skill: rule-one\nAlways name the limit.\nReview this diff.',
    };
    const stats = describePromptSections(assembly);
    expect(stats.find((s) => s.section === 'skills')?.tokens).toBeUndefined();
  });
});
