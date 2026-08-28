import type { EvalExpectation } from '@devdigest/shared';

/** The finding columns this module reads. Structural, so tests need no db row. */
export interface DecidedFinding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

const MAX_CASE_NAME = 120;

/**
 * The expectation a decision implies, or null when there is no decision.
 *
 * accepted  → `must_find`     ("the agent should have said this, here")
 * dismissed → `must_not_flag` ("the agent should not have said this")
 *
 * Severity and category are deliberately absent: a case that failed only
 * because CRITICAL became WARNING would make every prompt edit look like a
 * regression (spec 13, R1 + scoring notes).
 */
export function expectationFor(f: DecidedFinding): EvalExpectation | null {
  const kind = f.acceptedAt ? 'must_find' : f.dismissedAt ? 'must_not_flag' : null;
  if (!kind) return null;
  return {
    kind,
    file: f.file,
    start_line: f.startLine,
    end_line: f.endLine,
    title: f.title,
  };
}

/** Default case name: the finding's own title, bounded. */
export function caseNameFor(f: DecidedFinding): string {
  const title = f.title.trim();
  if (title.length <= MAX_CASE_NAME) return title;
  return `${title.slice(0, MAX_CASE_NAME - 1).trimEnd()}…`;
}

// ===========================================================================
// Scoring — spec 13, R4. Pure: no model call, no I/O, no clock.
// ===========================================================================

/** The finding fields scoring reads. Structural, so a test needs no LLM run. */
export interface ScorableFinding {
  file: string;
  start_line: number;
  end_line: number;
}

/** Half-open ranges would drop a one-line finding, so both ends are inclusive. */
function overlaps(a: { start_line: number; end_line: number }, b: ScorableFinding): boolean {
  return a.start_line <= b.end_line && b.start_line <= a.end_line;
}

/**
 * A finding satisfies an expectation when it cites the SAME FILE and its line
 * range OVERLAPS. Not text similarity, and deliberately not severity or
 * category: a reviewer that says the right thing about the right lines has to
 * pass even when it words the finding differently, or every prompt rewrite
 * reads as a regression and the suite becomes noise.
 */
export function matches(e: EvalExpectation, f: ScorableFinding): boolean {
  return e.file === f.file && overlaps(e, f);
}

export interface CaseScore {
  recall: number;
  precision: number;
  citation_accuracy: number;
  pass: boolean;
  /** Which must_find expectations went unmatched — the reason a case failed. */
  missed: EvalExpectation[];
  /** Findings that landed on a must_not_flag range — the noise precision counts. */
  flagged: ScorableFinding[];
}

/**
 * Score one case.
 *
 * `kept` are the findings that survived the grounding gate; `rawCount` is how
 * many the model produced before it. Citation accuracy is the ratio, so it
 * measures the agent's ability to cite a real diff line — nothing else here
 * reads it.
 *
 * Matching is per EXPECTATION and one finding satisfies at most one of them
 * (spec 13, corner case 2). Without that, a single sprawling finding covering
 * half the diff would satisfy every must_find at once and recall would report
 * a suite that works.
 */
export function scoreCase(
  expectations: EvalExpectation[],
  kept: ScorableFinding[],
  rawCount: number,
): CaseScore {
  const mustFind = expectations.filter((e) => e.kind === 'must_find');
  const mustNotFlag = expectations.filter((e) => e.kind === 'must_not_flag');

  const claimed = new Set<ScorableFinding>();
  const missed: EvalExpectation[] = [];
  for (const e of mustFind) {
    const hit = kept.find((f) => !claimed.has(f) && matches(e, f));
    if (hit) claimed.add(hit);
    else missed.push(e);
  }

  const flagged = kept.filter((f) => mustNotFlag.some((e) => matches(e, f)));

  // Each denominator has a defensible wrong answer, so each is stated:
  //   no must_find  -> 1: nothing was required, so nothing was missed. Reporting
  //                    0 would punish a correct run built only from dismissals.
  //   no findings   -> 1: saying nothing flags no noise. This is exactly why
  //                    precision alone can never be the gate.
  //   no raw output -> 1: nothing was dropped, because nothing existed.
  const recall = mustFind.length === 0 ? 1 : (mustFind.length - missed.length) / mustFind.length;
  const precision = kept.length === 0 ? 1 : (kept.length - flagged.length) / kept.length;
  const citation_accuracy = rawCount === 0 ? 1 : kept.length / rawCount;

  return {
    recall,
    precision,
    citation_accuracy,
    pass: missed.length === 0 && flagged.length === 0,
    missed,
    flagged,
  };
}

/** Mean of a run's per-case scores. An empty set is not scored — the route rejects it. */
export function aggregate(scores: CaseScore[]): {
  recall: number;
  precision: number;
  citation_accuracy: number;
  passed: number;
  total: number;
} {
  const mean = (pick: (s: CaseScore) => number) =>
    scores.length === 0 ? 0 : scores.reduce((n, s) => n + pick(s), 0) / scores.length;
  return {
    recall: mean((s) => s.recall),
    precision: mean((s) => s.precision),
    citation_accuracy: mean((s) => s.citation_accuracy),
    passed: scores.filter((s) => s.pass).length,
    total: scores.length,
  };
}

/**
 * Wrap a stored file patch in the git headers a unified diff needs.
 *
 * `pr_files.patch` holds the hunk body only — it starts at `@@`. The diff
 * parser takes a file's path from the `+++ b/<path>` line and DROPS files whose
 * path it could not resolve, so a headerless patch parses to zero files, the
 * grounding gate then finds no file to match against, and every finding is
 * dropped. The symptom is a case that can never pass: recall 0 and citation 0,
 * on any agent, with no error anywhere.
 *
 * Idempotent: a patch that already carries a header is returned unchanged.
 */
export function toUnifiedDiff(path: string, patch: string): string {
  const body = patch.trimStart();
  if (body.startsWith('diff --git')) return patch;
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');
}
