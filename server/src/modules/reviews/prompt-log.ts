import type { PromptAssembly } from '@devdigest/shared';

/**
 * Structured description of an assembled prompt, for the run log.
 *
 * The safety property is STRUCTURAL, not a rule someone has to remember:
 * `PromptSectionStat` has no field that can hold prompt text. Everything in
 * this file takes a string in and returns a number out, so there is no shape a
 * caller could log that carries a diff, a spec body, a secret pasted into a PR
 * description, or a snippet of anyone's source. Adding a `sample`/`preview`
 * field here would defeat the whole file — don't.
 *
 * What IS safe to record: which sections were assembled, where each came from,
 * how big each is, which model it was built for, and an id that ties the lines
 * of one assembly together and to its persisted trace.
 */

/** One assembled section, described without its content. */
export interface PromptSectionStat {
  /** Slot name, matching `PromptAssembly`'s field. */
  section: string;
  /** Where the text came from — a fixed fact per slot, not derived from content. */
  source: string;
  chars: number;
  /** Only populated in verbose mode (tokenising every section is not free). */
  tokens?: number;
}

export interface PromptAssemblySummary {
  correlationId: string;
  provider: string;
  model: string;
  sections: number;
  chars: number;
  /** Verbose mode only. */
  tokens?: number;
}

/**
 * Where each slot's text comes from. Static per slot — deliberately a lookup
 * rather than anything inferred from the text, so the description of a section
 * can never be influenced by its content.
 */
const SECTION_SOURCE: Record<string, string> = {
  system: 'agent system prompt + injection guard',
  intent: 'derived intent (intent layer)',
  pr_description: 'PR author body (untrusted)',
  skills: 'agent-linked skills',
  memory: 'memory retrieval',
  repo_map: 'repo-intel skeleton',
  specs: 'project context specs (untrusted)',
  callers: 'repo-intel callers digest',
  remainder: 'diff + section scaffolding',
};

/** Slots described individually. `user` is the envelope, reported as the total. */
const DESCRIBED_SLOTS = [
  'system',
  'intent',
  'pr_description',
  'skills',
  'memory',
  'repo_map',
  'specs',
  'callers',
] as const;

/**
 * Describe every populated section of an assembly.
 *
 * `countTokens` is injected rather than imported so this stays pure and so the
 * tokenizer is only paid for when verbose logging asked for it.
 *
 * The `remainder` row is the honest way to account for the diff: the engine
 * folds it into `user` and never exposes it as its own slot, so its size is
 * `user` minus the sections that appear inside `user`, and it also carries the
 * `## Heading` lines and `<untrusted>` wrappers. It is labelled for what it is
 * rather than reported as a clean diff measurement.
 */
export function describePromptSections(
  assembly: PromptAssembly,
  countTokens?: (text: string) => number,
): PromptSectionStat[] {
  const stats: PromptSectionStat[] = [];

  for (const slot of DESCRIBED_SLOTS) {
    const text = assembly[slot];
    if (typeof text !== 'string' || text.length === 0) continue;
    stats.push(statFor(slot, text, countTokens));
  }

  // Everything in `user` that no named slot accounts for. `system` is a
  // separate message and is excluded from the arithmetic.
  const insideUser = stats
    .filter((s) => s.section !== 'system')
    .reduce((sum, s) => sum + s.chars, 0);
  const remainder = assembly.user.length - insideUser;
  if (remainder > 0) {
    stats.push({
      section: 'remainder',
      source: SECTION_SOURCE.remainder!,
      chars: remainder,
      // Not tokenised: there is no single string to count — this is a
      // difference of lengths, and a fabricated token number would be worse
      // than an absent one.
    });
  }

  return stats;
}

function statFor(
  section: string,
  text: string,
  countTokens?: (text: string) => number,
): PromptSectionStat {
  return {
    section,
    source: SECTION_SOURCE[section] ?? 'unknown',
    chars: text.length,
    ...(countTokens ? { tokens: countTokens(text) } : {}),
  };
}

/** Roll the sections up into the one line that is always logged. */
export function summarisePromptAssembly(
  stats: PromptSectionStat[],
  meta: { correlationId: string; provider: string; model: string },
): PromptAssemblySummary {
  const tokened = stats.filter((s) => s.tokens !== undefined);
  return {
    ...meta,
    sections: stats.length,
    chars: stats.reduce((sum, s) => sum + s.chars, 0),
    ...(tokened.length > 0
      ? { tokens: tokened.reduce((sum, s) => sum + (s.tokens ?? 0), 0) }
      : {}),
  };
}

/** `128412` → `128.4k`, so a log line stays readable at a glance. */
export function formatChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** One human-readable line per section, for the verbose mode. */
export function formatSectionLine(stat: PromptSectionStat): string {
  const size =
    stat.tokens !== undefined
      ? `${formatChars(stat.chars)} chars / ${formatChars(stat.tokens)} tok`
      : `${formatChars(stat.chars)} chars`;
  return `  ${stat.section.padEnd(16)} ${size.padEnd(24)} ${stat.source}`;
}
