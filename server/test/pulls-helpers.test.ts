import { describe, it, expect } from 'vitest';
import {
  findingsByPr,
  latestCostByPr,
  latestReviewByPr,
} from '../src/modules/pulls/helpers.js';

/**
 * These three used to live inline in `pulls/routes.ts`, where they could only be
 * reached through a DB-backed request. They are pure, so the rules they encode
 * are asserted directly here.
 */

describe('latestReviewByPr', () => {
  it('keeps the first row seen per PR, because rows arrive newest-first', () => {
    const byPr = latestReviewByPr([
      { id: 'rv-new', prId: 'pr-1', score: 80 },
      { id: 'rv-old', prId: 'pr-1', score: 10 },
      { id: 'rv-other', prId: 'pr-2', score: null },
    ]);

    expect(byPr.get('pr-1')).toEqual({ id: 'rv-new', score: 80 });
    expect(byPr.get('pr-2')).toEqual({ id: 'rv-other', score: null });
  });

  it('is empty for no reviews', () => {
    expect(latestReviewByPr([]).size).toBe(0);
  });
});

describe('findingsByPr', () => {
  const reviews = new Map([
    ['pr-1', { id: 'rv-1', score: 50 }],
    ['pr-2', { id: 'rv-2', score: 90 }],
  ]);

  it('counts by severity for the review the score ring shows', () => {
    const byPr = findingsByPr(
      [
        { reviewId: 'rv-1', severity: 'CRITICAL' },
        { reviewId: 'rv-1', severity: 'WARNING' },
        { reviewId: 'rv-1', severity: 'WARNING' },
      ],
      reviews,
    );

    expect(byPr.get('pr-1')).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });

  it('reports zeros for a reviewed PR with no findings, not absence', () => {
    const byPr = findingsByPr([{ reviewId: 'rv-1', severity: 'CRITICAL' }], reviews);

    // "reviewed, nothing found" and "never reviewed" are different states.
    expect(byPr.get('pr-2')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it('ignores findings from a review that is not the latest one', () => {
    const byPr = findingsByPr(
      [
        { reviewId: 'rv-1', severity: 'CRITICAL' },
        { reviewId: 'rv-superseded', severity: 'CRITICAL' },
      ],
      reviews,
    );

    expect(byPr.get('pr-1')).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it('ignores a severity outside the contract instead of inventing a bucket', () => {
    const byPr = findingsByPr([{ reviewId: 'rv-1', severity: 'INFO' }], reviews);

    expect(byPr.get('pr-1')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it('is empty when there are no reviews at all', () => {
    expect(findingsByPr([{ reviewId: 'rv-1', severity: 'CRITICAL' }], new Map()).size).toBe(0);
  });
});

describe('latestCostByPr', () => {
  it('takes the newest completed run, not a sum over runs', () => {
    const byPr = latestCostByPr([
      { prId: 'pr-1', costUsd: 0.04 },
      { prId: 'pr-1', costUsd: 0.11 },
    ]);

    expect(byPr.get('pr-1')).toBe(0.04);
  });

  it('keeps a null cost as null rather than falling through to an older run', () => {
    const byPr = latestCostByPr([
      { prId: 'pr-1', costUsd: null },
      { prId: 'pr-1', costUsd: 0.11 },
    ]);

    expect(byPr.get('pr-1')).toBeNull();
    expect(byPr.has('pr-1')).toBe(true);
  });

  it('skips runs with no PR', () => {
    const byPr = latestCostByPr([{ prId: null, costUsd: 0.5 }]);
    expect(byPr.size).toBe(0);
  });
});
