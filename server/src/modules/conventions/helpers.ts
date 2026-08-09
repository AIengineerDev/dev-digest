import type { Convention, ConventionCategory, ConventionStatus } from '@devdigest/shared';
import { MAX_FILE_SAMPLE_CHARS } from './constants.js';

/**
 * Pure helpers for the conventions module: sample formatting, the evidence gate,
 * row→DTO mapping and skill-body composition. No I/O, no db, no adapters —
 * `pnpm arch`'s `helpers-are-pure` rule forbids both, and everything here is
 * worth testing without a database anyway.
 *
 * Row shapes are declared structurally rather than imported from `repository.ts`
 * for the same reason the skills module does it: importing the repository's
 * re-export would create a cycle, and importing `src/db/rows.js` would break
 * purity. `service.ts` passes the real Drizzle row and structural typing checks
 * the two agree.
 */

/** The `conventions` columns this module maps to a DTO. */
export interface ConventionRowLike {
  id: string;
  repoId: string | null;
  category: string;
  rule: string;
  rationale: string | null;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
  status: string;
  headSha: string | null;
  createdAt: Date;
}

export function toConventionDto(row: ConventionRowLike): Convention {
  return {
    id: row.id,
    repo_id: row.repoId,
    category: row.category as ConventionCategory,
    rule: row.rule,
    rationale: row.rationale,
    evidence_path: row.evidencePath,
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence,
    status: row.status as ConventionStatus,
    head_sha: row.headSha,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------- sampling

/**
 * Render one sampled file as a numbered listing, truncated to the per-file
 * budget.
 *
 * The line numbers are the point: the model is asked to cite
 * `evidence_line`, and it can only do that honestly if it can see the numbers.
 * Truncation is stated in the text rather than silent, so the model does not
 * conclude a file ends where the budget ended.
 */
export function renderNumberedFile(
  path: string,
  source: string,
  maxChars: number = MAX_FILE_SAMPLE_CHARS,
): string {
  const truncated = source.length > maxChars;
  const body = truncated ? source.slice(0, maxChars) : source;
  const numbered = body
    .split('\n')
    .map((line, i) => `${i + 1}\t${line}`)
    .join('\n');
  const tail = truncated ? '\n… (file truncated for sampling)' : '';
  return `--- ${path} ---\n${numbered}${tail}`;
}

/** Join rendered files, stopping before the total budget is exceeded. */
export function joinSamples(rendered: string[], maxTotalChars: number): string {
  const kept: string[] = [];
  let used = 0;
  for (const block of rendered) {
    if (used + block.length > maxTotalChars) break;
    kept.push(block);
    used += block.length;
  }
  return kept.join('\n\n');
}

// ------------------------------------------------------------ evidence gate

/**
 * Whitespace-insensitive comparison key for a line of code.
 *
 * Models re-indent what they quote and collapse tabs, so a byte-exact match
 * would reject correct evidence. Everything else — identifiers, punctuation,
 * case — must still match: those are the parts that make the snippet a claim
 * about this file rather than about code in general.
 */
export function normalizeCodeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

export interface EvidenceCheck {
  ok: boolean;
  /** Where the snippet actually starts, 1-based. Only meaningful when ok. */
  line: number;
  /** Why it failed, for the run log. */
  reason?: 'empty-snippet' | 'not-found';
}

/**
 * Locate a quoted snippet in the file it was quoted from.
 *
 * The snippet is the claim and the line number is a pointer, so a snippet that
 * is present but at a different line is **corrected, not rejected** — models
 * routinely miscount by a few lines, and throwing the candidate away would cost
 * a real convention over a cosmetic error. A snippet that is nowhere in the file
 * fails: at that point the model is quoting code it wrote itself.
 *
 * The anchor is the snippet's first non-empty line; multi-line snippets are not
 * matched in full because the model reflows them. When the anchor occurs several
 * times, the occurrence nearest the claimed line wins — that is the reading most
 * favourable to a model that was approximately right.
 */
export function findEvidenceLine(
  fileSource: string,
  snippet: string,
  claimedLine: number,
): EvidenceCheck {
  const anchor = snippet
    .split('\n')
    .map(normalizeCodeLine)
    .find((l) => l.length > 0);
  if (!anchor) return { ok: false, line: 0, reason: 'empty-snippet' };

  const lines = fileSource.split('\n');
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (normalizeCodeLine(lines[i] ?? '').includes(anchor)) hits.push(i + 1);
  }
  if (hits.length === 0) return { ok: false, line: 0, reason: 'not-found' };

  const nearest = hits.reduce((best, cur) =>
    Math.abs(cur - claimedLine) < Math.abs(best - claimedLine) ? cur : best,
  );
  return { ok: true, line: nearest };
}

// --------------------------------------------------------------- skill body

/** The convention fields the skill body is composed from. */
export interface ConventionForSkill {
  category: string;
  rule: string;
  rationale?: string | null;
  evidence_path: string;
  evidence_line: number;
  evidence_snippet: string;
}

/** Stable, filename-safe slug for a rule heading. */
export function slugifyRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

/**
 * Compose the skill body from the accepted candidates.
 *
 * Every rule keeps its evidence in the body — not for the reviewer's benefit but
 * for the model's: a rule stated with the code it was derived from is one the
 * agent can pattern-match against a diff, where a bare imperative is one it has
 * to guess at. The `file:line` also survives into review comments, so a finding
 * can point at the precedent rather than at the skill.
 */
export function buildConventionsSkillBody(
  repoName: string,
  conventions: ConventionForSkill[],
): string {
  const header = [
    `# ${repoName} — house conventions`,
    '',
    `Conventions extracted from \`${repoName}\` and confirmed by a maintainer.`,
    'Flag any change that violates a rule below, and cite the offending `file:line`.',
    'A rule not covered here is not a finding — say nothing rather than inventing one.',
  ].join('\n');

  const blocks = conventions.map((c) => {
    const lines = [
      `## ${slugifyRule(c.rule)}`,
      `**${c.category}** — ${c.rule}`,
    ];
    if (c.rationale) lines.push('', c.rationale);
    lines.push(
      '',
      `Precedent — \`${c.evidence_path}:${c.evidence_line}\`:`,
      '',
      '```',
      c.evidence_snippet.trim(),
      '```',
    );
    return lines.join('\n');
  });

  return [header, ...blocks].join('\n\n');
}

/**
 * Distinct evidence files, in first-seen order — what `skills.evidence_files`
 * records so a skill can be traced back to the code that produced it.
 */
export function evidenceFilesOf(conventions: ConventionForSkill[]): string[] {
  return [...new Set(conventions.map((c) => c.evidence_path))];
}
