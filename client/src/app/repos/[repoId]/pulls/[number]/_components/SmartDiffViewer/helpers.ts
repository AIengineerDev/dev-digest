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
import {
  EXPAND_MAX_LINES,
  EXPANDED_ROLES,
  KEY_SEP,
  SEVERITY_RANK,
  UNKNOWN_MARK_SEVERITY,
} from "./constants";

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

/** CRITICAL beats WARNING beats SUGGESTION — which of several findings on one
 *  line the mark speaks for. Ties keep the first, so the order is stable. */
function worstOf(findings: readonly FindingRecord[]): FindingRecord | undefined {
  let worst: FindingRecord | undefined;
  for (const f of findings) {
    if (!worst || (SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[worst.severity] ?? 0)) {
      worst = f;
    }
  }
  return worst;
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
          // A "run all agents" pass writes one review per agent, so two of them
          // flagging the same line is ordinary, not exotic. Taking `[0]` made
          // the mark's severity and its card depend on review order: a
          // SUGGESTION could mask a CRITICAL on the same line. The mark speaks
          // for the worst of them, and its title names the rest.
          const matches = index.get(`${file.path}${KEY_SEP}${line}`) ?? [];
          const worst = worstOf(matches);
          return {
            id: worst?.id ?? `${file.path}:${line}`,
            // Only a matched line has a card in the Findings tab to jump to.
            findingId: worst?.id ?? null,
            line,
            severity: worst?.severity ?? UNKNOWN_MARK_SEVERITY,
            title: matches.map((f) => f.title).join(" · "),
          };
        }),
      );
    }
  }
  return out;
}

/**
 * Marks for findings of an OLDER head, anchored client-side.
 *
 * The server never reports these: `finding_lines` is the current head's answer
 * by design. So the anchor is the finding's own `start_line`, which belonged to
 * a different revision of the file — it may land on an unrelated line, or on no
 * rendered line at all. That is exactly why they are off by default, marked
 * `stale`, and drawn differently: this is "here is roughly where the last
 * review was looking", not "this line is flagged".
 *
 * Only files the current diff actually contains get marks; a finding about a
 * file that is no longer in the PR has nowhere to go.
 */
export function buildStaleAnnotations(
  groups: readonly SmartDiffGroup[],
  findings: readonly FindingRecord[],
): DiffAnnotations {
  const paths = new Set(groups.flatMap((g) => g.files.map((f) => f.path)));
  const out = new Map<string, DiffFindingMark[]>();
  for (const f of findings) {
    if (!paths.has(f.file)) continue;
    const marks = out.get(f.file) ?? [];
    marks.push({
      id: f.id,
      findingId: f.id,
      line: f.start_line,
      severity: f.severity,
      title: f.title,
      stale: true,
    });
    out.set(f.file, marks);
  }
  return out;
}

/**
 * Where to land when the stale marks are revealed: the first one, in the order
 * the groups are read — core logic before wiring before boilerplate. Undefined
 * when no stale finding lands on a file this diff still has.
 */
export function firstStaleMark(
  groups: readonly SmartDiffGroup[],
  findings: readonly FindingRecord[],
): { path: string; line: number } | undefined {
  const marks = buildStaleAnnotations(groups, findings);
  for (const group of groups) {
    for (const file of group.files) {
      const first = marks.get(file.path)?.[0];
      if (first) return { path: file.path, line: first.line };
    }
  }
  return undefined;
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
  alsoOpen?: ReadonlySet<string>,
): (file: PrFile) => boolean {
  const flagged = new Set(group.files.filter((f) => f.finding_lines.length > 0).map((f) => f.path));
  // A revealed stale mark is useless inside a collapsed card.
  if (alsoOpen) for (const path of alsoOpen) flagged.add(path);
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
