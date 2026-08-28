import { describe, it, expect } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  aggregate,
  caseNameFor,
  expectationFor,
  scoreCase,
  toUnifiedDiff,
  type DecidedFinding,
} from '../src/modules/eval/helpers.js';

/**
 * The decision → expectation mapping, hermetically.
 *
 * This is the half of spec 13's R1 that decides what a case asserts, and none of
 * it needs a database or a model. The rule under test is that the user never
 * picks the expectation kind: the decision already made it.
 */

const base: DecidedFinding = {
  id: 'f1',
  file: '.github/workflows/evals.yml',
  startLine: 89,
  endLine: 104,
  title: 'Do not expose provider secrets to pull-request checkout code',
  acceptedAt: null,
  dismissedAt: null,
};

describe('expectationFor', () => {
  it('maps an accepted finding to must_find at its own coordinates', () => {
    const e = expectationFor({ ...base, acceptedAt: new Date() });
    expect(e).toEqual({
      kind: 'must_find',
      file: base.file,
      start_line: 89,
      end_line: 104,
      title: base.title,
    });
  });

  it('maps a dismissed finding to must_not_flag', () => {
    const e = expectationFor({ ...base, dismissedAt: new Date() });
    expect(e?.kind).toBe('must_not_flag');
  });

  it('offers nothing for an undecided finding', () => {
    expect(expectationFor(base)).toBeNull();
  });

  it('does not carry severity or category into the expectation', () => {
    const e = expectationFor({ ...base, acceptedAt: new Date() })!;
    // A case that failed only because CRITICAL became WARNING would make every
    // prompt edit look like a regression.
    expect(Object.keys(e).sort()).toEqual(
      ['end_line', 'file', 'kind', 'start_line', 'title'].sort(),
    );
  });
});

describe('caseNameFor', () => {
  it('uses the finding title as-is when it fits', () => {
    expect(caseNameFor(base)).toBe(base.title);
  });

  it('bounds a long title', () => {
    const name = caseNameFor({ ...base, title: 'x'.repeat(400) });
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.endsWith('…')).toBe(true);
  });
});

// ===========================================================================
// Scoring (spec 13, R4). Every case is synthetic and the module under test
// imports no provider — that is the point of scoring being code.
// ===========================================================================

const find = (file: string, a: number, b: number): EvalExpectation => ({
  kind: 'must_find',
  file,
  start_line: a,
  end_line: b,
});
const notFlag = (file: string, a: number, b: number): EvalExpectation => ({
  kind: 'must_not_flag',
  file,
  start_line: a,
  end_line: b,
});
const f = (file: string, a: number, b: number) => ({ file, start_line: a, end_line: b });

describe('scoreCase', () => {
  it('matches on file equality and line overlap, not on exact lines', () => {
    const s = scoreCase([find('a.ts', 10, 20)], [f('a.ts', 18, 25)], 1);
    expect(s.recall).toBe(1);
    expect(s.pass).toBe(true);
  });

  it('does not match a touching-but-disjoint range', () => {
    const s = scoreCase([find('a.ts', 10, 20)], [f('a.ts', 21, 30)], 1);
    expect(s.recall).toBe(0);
    expect(s.missed).toHaveLength(1);
  });

  it('does not match the right lines in the wrong file', () => {
    expect(scoreCase([find('a.ts', 10, 20)], [f('b.ts', 10, 20)], 1).recall).toBe(0);
  });

  it('counts one finding against at most one expectation', () => {
    // One sprawling finding covering both ranges must not satisfy both, or a
    // single vague comment would score the suite as fully passing.
    const s = scoreCase([find('a.ts', 1, 5), find('a.ts', 90, 95)], [f('a.ts', 1, 100)], 1);
    expect(s.recall).toBe(0.5);
  });

  it('lowers precision when a finding lands on a must_not_flag range', () => {
    const s = scoreCase([notFlag('a.ts', 1, 5)], [f('a.ts', 2, 3), f('b.ts', 7, 9)], 2);
    expect(s.precision).toBe(0.5);
    expect(s.recall).toBe(1);
    expect(s.pass).toBe(false);
  });

  it('reports citation accuracy as the share that survived grounding', () => {
    expect(scoreCase([find('a.ts', 1, 5)], [f('a.ts', 1, 5)], 4).citation_accuracy).toBe(0.25);
  });

  it('scores recall 1 when nothing was required', () => {
    expect(scoreCase([notFlag('a.ts', 1, 5)], [], 0).recall).toBe(1);
  });

  it('scores precision 1 when the agent said nothing', () => {
    expect(scoreCase([notFlag('a.ts', 1, 5)], [], 0).precision).toBe(1);
  });

  it('scores citation accuracy 1 when the model produced nothing to drop', () => {
    expect(scoreCase([find('a.ts', 1, 5)], [], 0).citation_accuracy).toBe(1);
  });
});

describe('aggregate', () => {
  it('means each metric and counts passing cases', () => {
    const a = scoreCase([find('a.ts', 1, 2)], [f('a.ts', 1, 2)], 1);
    const b = scoreCase([find('b.ts', 1, 2)], [], 0);
    const agg = aggregate([a, b]);
    expect(agg.recall).toBe(0.5);
    expect(agg.passed).toBe(1);
    expect(agg.total).toBe(2);
  });
});

describe('toUnifiedDiff', () => {
  it('adds the headers a headerless patch is missing', () => {
    const out = toUnifiedDiff('src/a.ts', '@@ -0,0 +1 @@\n+x');
    expect(out.split('\n').slice(0, 3)).toEqual([
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
    ]);
  });

  it('leaves a patch that already has a header alone', () => {
    const already = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+x';
    expect(toUnifiedDiff('x', already)).toBe(already);
  });

  it('produces a diff the parser can actually resolve a path from', () => {
    // The regression this guards: a headerless patch parses to ZERO files, so
    // grounding drops every finding and the case can never pass.
    const parsed = parseUnifiedDiff(toUnifiedDiff('src/a.ts', '@@ -0,0 +1 @@\n+x'));
    expect(parsed.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });
});
