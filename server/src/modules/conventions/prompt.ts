import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';
import { MAX_CANDIDATES } from './constants.js';

/**
 * The extraction prompt and the shape the model must answer in.
 *
 * Pure string/schema construction — no I/O — so the wording can be tested and
 * diffed like code. It is the highest-leverage file in the module: everything
 * downstream can only reject bad candidates, never invent good ones.
 */

/** One candidate as the model returns it, before the evidence gate. */
export const ProposedConvention = z.object({
  category: ConventionCategory,
  /** Imperative, one sentence, mechanically checkable against a diff. */
  rule: z.string().min(8),
  /** Why the repo does it this way, if the code says. Empty when it doesn't. */
  rationale: z.string(),
  evidence_path: z.string().min(1),
  evidence_line: z.number().int().positive(),
  /** Verbatim from the numbered listing, 1–3 lines, without the line numbers. */
  evidence_snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type ProposedConvention = z.infer<typeof ProposedConvention>;

export const ExtractionResponse = z.object({
  conventions: z.array(ProposedConvention),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponse>;

/**
 * System prompt.
 *
 * Three things it insists on, each because the obvious failure mode is the
 * opposite: only rules the sampled code *demonstrates* (models otherwise recite
 * generic best practice), verbatim evidence with a visible line number (models
 * otherwise paraphrase code that does not exist), and repetition as the test of
 * a convention (one occurrence is a choice; three are a rule).
 */
export function extractionSystemPrompt(): string {
  return [
    'You extract the house conventions of ONE specific repository from a sample of its files.',
    '',
    'A convention is a rule this codebase already follows, visible in the code you are shown.',
    'It is NOT general programming advice, and NOT what you think the code should do.',
    '',
    'Rules for every candidate you return:',
    '1. GROUNDED — `evidence_path` must be one of the sampled files, and',
    '   `evidence_snippet` must be copied VERBATIM from that file, without the line',
    '   number prefix. Never quote code you composed. `evidence_line` is the number',
    '   shown at the start of the line you copied.',
    '2. REPEATED — prefer a pattern you can see in several files or several times in',
    '   one file. A single occurrence is a choice, not a convention.',
    '3. CHECKABLE — phrase the rule so a reviewer reading a diff can say "this change',
    '   breaks it" or "it does not". "Use good names" is not checkable; "route handlers',
    '   return Result<T, ApiError>" is.',
    '4. SPECIFIC — a rule that would be true of any TypeScript repo is worthless here.',
    '   If the sample only shows generic style, return fewer candidates.',
    '5. CALIBRATED — `confidence` is how sure you are that this is a deliberate rule of',
    '   THIS repo. Wide, repeated, config-backed patterns are high; a single tidy',
    '   function is low. Do not inflate: a low-confidence candidate is useful, a',
    '   confidently wrong one is not.',
    '',
    `Return at most ${MAX_CANDIDATES} candidates. Fewer, well-evidenced ones are better.`,
    'Every candidate is verified against the real files afterwards, and any whose',
    'snippet is not found is discarded — so an invented quote costs you the whole rule.',
  ].join('\n');
}

/**
 * User message: the repo name, the file list, and the numbered sample.
 *
 * The path list is repeated above the sample because it is also the allowlist the
 * server verifies against — the model is told the exact set it may cite, so a
 * dropped candidate is its error and not an ambiguity we created.
 */
export function extractionUserPrompt(repoFullName: string, sample: string, paths: string[]): string {
  return [
    `Repository: ${repoFullName}`,
    '',
    `Sampled files (${paths.length}) — you may cite ONLY these paths:`,
    ...paths.map((p) => `- ${p}`),
    '',
    'Files, each line prefixed with its 1-based line number and a tab:',
    '',
    sample,
  ].join('\n');
}
