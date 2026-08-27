/**
 * A5's rubric half (R9) — table-driven over the boundary cases the plan
 * names verbatim: `plans/12-onboarding-generator.plan.md` Phase A2 Done when.
 */
import { describe, it, expect } from 'vitest';
import { computeDifficulty } from '../src/modules/tour/derive/difficulty.js';

describe('computeDifficulty', () => {
  it.each([
    [2, 49, 'low'],
    [3, 49, 'medium'],
    [15, 89, 'medium'],
    [16, 0, 'high'],
    [0, 90, 'high'],
  ] as const)('(C=%i, P=%i) → %s', (callers, percentile, expected) => {
    expect(computeDifficulty(callers, percentile).difficulty).toBe(expected);
  });

  it('no file_rank row → low + no_index_signal', () => {
    const result = computeDifficulty(100, null);
    expect(result.difficulty).toBe('low');
    expect(result.basis).toEqual({ callers: 100, rank_percentile: null, signal: 'no_index_signal' });
  });

  it('records callers and percentile on the basis for an indexed signal', () => {
    const result = computeDifficulty(3, 49);
    expect(result.basis).toEqual({ callers: 3, rank_percentile: 49, signal: 'indexed' });
  });
});
