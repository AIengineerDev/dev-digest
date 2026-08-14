/**
 * Pure smart-diff rules: path → role, files + findings → grouped contract.
 *
 * Everything here is deterministic and side-effect free — no DB, no adapters,
 * and above all no model call. Smart Diff re-orders what the PR import and the
 * last review already produced; it never asks anything new.
 */

import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_PATTERNS,
  GROUP_ORDER,
  ROLE_ORDER,
  SPLIT_GROUP_DEPTH,
  SPLIT_MAX_GROUPS,
  SPLIT_MAX_REVIEWABLE_FILES,
  SPLIT_MAX_REVIEWABLE_LINES,
  SPLIT_MIN_FILES_PER_GROUP,
  WIRING_PATTERNS,
} from './constants.js';

const PATTERNS: Record<SmartDiffRole, readonly RegExp[]> = {
  boilerplate: BOILERPLATE_PATTERNS,
  wiring: WIRING_PATTERNS,
  // core is the fallthrough: it has no patterns of its own, on purpose. A rule
  // list for "business logic" would be a list of every language's file
  // extensions, and it would be wrong for the next repo.
  core: [],
};

/** Normalise a repo-relative path so the patterns only ever see POSIX form. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * The single classification rule. First matching role in `ROLE_ORDER` wins, so
 * `package-lock.json` is boilerplate even though it is also configuration.
 */
export function classifyPath(path: string): SmartDiffRole {
  const p = normalizePath(path);
  for (const role of ROLE_ORDER) {
    if (PATTERNS[role].some((re) => re.test(p))) return role;
  }
  return 'core';
}

/** A changed file as the classifier needs it — structurally typed, so the
 *  service can pass a Drizzle row or a `PrFile` without a conversion step. */
export interface ClassifiableFile {
  path: string;
  additions: number;
  deletions: number;
}

/** Lines a finding points at, keyed by the file it points at. */
export type FindingLinesByPath = ReadonlyMap<string, readonly number[]>;

function changedLines(f: ClassifiableFile): number {
  return (f.additions ?? 0) + (f.deletions ?? 0);
}

/**
 * Order inside a group: files carrying findings first, then the largest change,
 * then path for a stable tie-break.
 *
 * Findings-first is the whole point of the feature after a review has run;
 * before one has, `finding_lines` is empty everywhere and the order degrades
 * cleanly to largest-change-first.
 */
function compareFiles(a: SmartDiffFile, b: SmartDiffFile): number {
  if (a.finding_lines.length !== b.finding_lines.length)
    return b.finding_lines.length - a.finding_lines.length;
  const sizeA = a.additions + a.deletions;
  const sizeB = b.additions + b.deletions;
  if (sizeA !== sizeB) return sizeB - sizeA;
  return a.path.localeCompare(b.path);
}

function toSmartDiffFile(file: ClassifiableFile, findingLines: FindingLinesByPath): SmartDiffFile {
  const lines = findingLines.get(normalizePath(file.path)) ?? [];
  return {
    path: file.path,
    // Null, always: a pseudocode summary is an LLM product and Smart Diff makes
    // no model call. The field stays in the contract for the brief pipeline,
    // which does have one.
    pseudocode_summary: null,
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
    finding_lines: [...new Set(lines)].sort((x, y) => x - y),
  };
}

/** Group the PR's files by role, in `GROUP_ORDER`. Empty groups are kept so the
 *  UI renders a stable three-section layout instead of shifting between PRs. */
export function groupFiles(
  files: readonly ClassifiableFile[],
  findingLines: FindingLinesByPath,
): SmartDiffGroup[] {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>(GROUP_ORDER.map((r) => [r, []]));
  for (const file of files) {
    byRole.get(classifyPath(file.path))!.push(toSmartDiffFile(file, findingLines));
  }
  return GROUP_ORDER.map((role) => ({
    role,
    files: byRole.get(role)!.sort(compareFiles),
  }));
}

/** `src/modules/pulls/routes.ts` → `src/modules/pulls` (at depth 3). Files
 *  shallower than the depth key on their own directory, or on `/` at the root. */
function splitKeyFor(path: string): string {
  const parts = normalizePath(path).split('/');
  if (parts.length <= 1) return '(root)';
  return parts.slice(0, Math.min(SPLIT_GROUP_DEPTH, parts.length - 1)).join('/');
}

/**
 * Split advice, computed from the reviewable files only (core + wiring).
 *
 * `total_lines` is the reviewable line count, not the PR's — it is the number
 * the `too_big` verdict is actually about, and reporting the raw total next to
 * a verdict derived from a different figure is how a reviewer stops trusting
 * the banner.
 */
export function suggestSplit(groups: readonly SmartDiffGroup[]): SmartDiff['split_suggestion'] {
  const reviewable = groups
    .filter((g) => g.role !== 'boilerplate')
    .flatMap((g) => g.files);
  const totalLines = reviewable.reduce((n, f) => n + f.additions + f.deletions, 0);
  const tooBig =
    totalLines > SPLIT_MAX_REVIEWABLE_LINES || reviewable.length > SPLIT_MAX_REVIEWABLE_FILES;

  if (!tooBig) return { too_big: false, total_lines: totalLines, proposed_splits: [] };

  const buckets = new Map<string, string[]>();
  for (const f of reviewable) {
    const key = splitKeyFor(f.path);
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(f.path);
  }

  const proposed = [...buckets.entries()]
    .filter(([, files]) => files.length >= SPLIT_MIN_FILES_PER_GROUP)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, SPLIT_MAX_GROUPS)
    .map(([name, files]) => ({ name, files: [...files].sort() }));

  // One bucket is not a split — the PR is big but cohesive, which is a fine
  // reason to leave it alone. Say it is big, propose nothing.
  return {
    too_big: true,
    total_lines: totalLines,
    proposed_splits: proposed.length > 1 ? proposed : [],
  };
}

/** The whole contract, from already-imported files and already-stored findings. */
export function buildSmartDiff(
  files: readonly ClassifiableFile[],
  findingLines: FindingLinesByPath,
): SmartDiff {
  const groups = groupFiles(files, findingLines);
  return { groups, split_suggestion: suggestSplit(groups) };
}
