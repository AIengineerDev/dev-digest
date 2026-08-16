/** Pure joins behind SmartDiffViewer. No React, no fetching.
 *
 *  Two data sources meet here: `GET /pulls/:id/smart-diff` says WHICH lines are
 *  flagged (and is the source of truth for the badge count), and the reviews
 *  the page already has say WHAT each finding is. Neither is re-fetched for the
 *  other's sake, and nothing here calls a model. */

import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  SmartDiffFile,
  SmartDiffGroup,
} from "@devdigest/shared";
import type { DiffAnnotations, DiffFindingMark } from "@/components/diff-viewer";
import { isStaleRun } from "../staleness";
import { EXPAND_MAX_LINES, EXPANDED_ROLES, KEY_SEP, UNKNOWN_MARK_SEVERITY } from "./constants";

/**
 * The findings the badges describe: every review of the PR's CURRENT head.
 *
 * This must be the same rule the server used to build `finding_lines`, or the
 * count and the severity disagree. Not "the newest review row" — one "run all
 * agents" writes one review per agent, so the newest row is one agent's
 * opinion. `isStaleRun` supplies the tolerant null handling: a review with no
 * recorded head counts as current, because we cannot say otherwise.
 */
export function findingsAtHead(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): FindingRecord[] {
  return (reviews ?? [])
    .filter((r) => r.kind === "review" && !isStaleRun(r.head_sha, headSha))
    .flatMap((r) => r.findings);
}

/**
 * The findings the badges deliberately leave out: those of reviews that ran
 * against an older head.
 *
 * They are not shown, and that is correct — they describe lines that may no
 * longer exist. But a diff with no markers and no explanation reads as "this
 * code is clean", which is the opposite of what a stale critical finding means.
 * The viewer uses this to say so out loud.
 */
export function staleFindings(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): FindingRecord[] {
  return (reviews ?? [])
    .filter((r) => r.kind === "review" && isStaleRun(r.head_sha, headSha))
    .flatMap((r) => r.findings);
}

/** The head the stale findings describe — for naming it in the notice. */
export function staleHeadSha(
  reviews: readonly ReviewRecord[] | undefined,
  headSha: string | null | undefined,
): string | null {
  const review = (reviews ?? []).find(
    (r) => r.kind === "review" && isStaleRun(r.head_sha, headSha) && r.findings.length > 0,
  );
  return review?.head_sha ?? null;
}

/** Findings keyed by `path<NUL>line`, so a lookup is O(1) per flagged line. */
function indexFindings(findings: readonly FindingRecord[]): Map<string, FindingRecord[]> {
  const index = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const key = `${f.file}${KEY_SEP}${f.start_line}`;
    const bucket = index.get(key);
    if (bucket) bucket.push(f);
    else index.set(key, [f]);
  }
  return index;
}

/**
 * Finding marks per path, one per line the server flagged.
 *
 * The count therefore always equals `finding_lines.length` — the badge and the
 * API agree by construction. Severity and title are looked up from the review;
 * a line with no match still gets a mark, because the server's list is the
 * claim and a silently-dropped badge would look like a clean file.
 */
export function buildAnnotations(
  groups: readonly SmartDiffGroup[],
  findings: readonly FindingRecord[],
): DiffAnnotations {
  const index = indexFindings(findings);
  const out = new Map<string, DiffFindingMark[]>();
  for (const group of groups) {
    for (const file of group.files) {
      if (file.finding_lines.length === 0) continue;
      out.set(
        file.path,
        file.finding_lines.map((line): DiffFindingMark => {
          const match = index.get(`${file.path}${KEY_SEP}${line}`)?.[0];
          return {
            id: match?.id ?? `${file.path}:${line}`,
            // Only a matched line has a card in the Findings tab to jump to.
            findingId: match?.id ?? null,
            line,
            severity: match?.severity ?? UNKNOWN_MARK_SEVERITY,
            title: match?.title ?? "",
          };
        }),
      );
    }
  }
  return out;
}

/**
 * Attach each classified file to the patch text the PR detail already holds.
 *
 * `smart-diff` returns paths and counts, never patches — the diff text is
 * already in the page, and sending a second copy of it would double the
 * payload for nothing. A classified file whose patch is missing is dropped: the
 * only way that happens is the two responses disagreeing about the file list,
 * and rendering a card with nothing in it explains less than omitting it.
 */
export function withPatches(files: readonly SmartDiffFile[], prFiles: readonly PrFile[]): PrFile[] {
  const byPath = new Map(prFiles.map((f) => [f.path, f]));
  return files.flatMap((f) => {
    const pr = byPath.get(f.path);
    return pr ? [pr] : [];
  });
}

/**
 * Which cards start open: core files, unless they are huge — and anything with
 * a finding, whatever its role or size. Boilerplate never opens on its own.
 */
export function defaultOpenPredicate(
  group: SmartDiffGroup,
): (file: PrFile) => boolean {
  const flagged = new Set(group.files.filter((f) => f.finding_lines.length > 0).map((f) => f.path));
  const expandRole = EXPANDED_ROLES.includes(group.role);
  return (file: PrFile) => {
    if (flagged.has(file.path)) return true;
    if (!expandRole) return false;
    return (file.additions ?? 0) + (file.deletions ?? 0) <= EXPAND_MAX_LINES;
  };
}

/** Total findings across a group, for its header count. */
export function groupFindingCount(group: SmartDiffGroup): number {
  return group.files.reduce((n, f) => n + f.finding_lines.length, 0);
}
