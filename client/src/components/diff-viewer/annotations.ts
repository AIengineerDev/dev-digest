/* Finding overlays for the DiffViewer.

   Separate from `comments.ts` on purpose: a GitHub review comment is written by
   a person and posted back to GitHub, a finding is produced by a review run and
   is read-only here. They anchor to a line the same way and share nothing else. */
import type { Severity } from "@devdigest/shared";
import type { Line } from "./helpers";

/** One finding anchored to a line of the new file. */
export interface DiffFindingMark {
  id: string;
  /**
   * The finding row this mark stands for, when the flagged line could be
   * matched to one — the id the Findings tab addresses a card by.
   *
   * `null` when the API reports a flagged line the loaded reviews do not
   * explain. The mark is still drawn (the server's list is the claim), but
   * there is no card to open, so such a mark reveals the line in place instead.
   */
  findingId: string | null;
  /** `Finding.start_line` — a line number in the NEW file. */
  line: number;
  severity: Severity;
  title: string;
  /**
   * This mark comes from a review of an OLDER head, shown only because the
   * reader asked for it. The line number is that review's, so it may name a
   * line this diff no longer has — which is why these render differently and
   * are never on by default.
   */
  stale?: boolean;
}

/**
 * The mark a badge click should act on: the first one, by line, that has a card
 * behind it. Falls back to the topmost mark so a click is never inert.
 */
export function primaryMark(
  marks: readonly DiffFindingMark[],
): DiffFindingMark | undefined {
  const byLine = [...marks].sort((a, b) => a.line - b.line);
  return byLine.find((m) => m.findingId) ?? byLine[0];
}

/** Finding marks per file path. Empty map = the PR has not been reviewed. */
export type DiffAnnotations = ReadonlyMap<string, readonly DiffFindingMark[]>;

/**
 * A request to scroll to one line and highlight it.
 *
 * `nonce` exists so clicking the same badge twice scrolls twice: without it the
 * prop is deep-equal to its previous value and nothing re-fires.
 */
export interface DiffReveal {
  path: string;
  line: number;
  nonce: number;
}

/**
 * DOM id of a rendered diff line. Paths contain `/` and `.`, which are legal in
 * an HTML id but not in a bare CSS selector — always resolve these with
 * `getElementById`, never `querySelector`.
 */
export function diffLineDomId(path: string, line: number): string {
  return `diff-line-${path}-L${line}`;
}

/** Marks anchored to a parsed line. Findings address the new file, so a deleted
 *  line (which has no `newNo`) can never carry one. */
export function marksForLine(
  ln: Line,
  marks: readonly DiffFindingMark[],
): readonly DiffFindingMark[] {
  if (marks.length === 0 || ln.newNo == null) return [];
  return marks.filter((m) => m.line === ln.newNo);
}

/** CRITICAL beats WARNING beats SUGGESTION — the colour a multi-finding line takes. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

export function worstSeverity(marks: readonly DiffFindingMark[]): Severity | null {
  let worst: Severity | null = null;
  for (const m of marks) {
    if (!worst || SEVERITY_RANK[m.severity] > SEVERITY_RANK[worst]) worst = m.severity;
  }
  return worst;
}
