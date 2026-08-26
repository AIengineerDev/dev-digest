/**
 * A24 — the reading list is strictly rank-ordered; nothing re-sorts it.
 * `buildReading` never sorts its input — the ORDER IS THE INPUT'S — so
 * feeding it ranks in descending order and asserting the output preserves
 * that order is the whole test.
 */
import { describe, it, expect } from 'vitest';
import { buildReading } from '../src/modules/tour/derive/reading.js';

describe('buildReading', () => {
  it('preserves the rank-descending order of the input, restricted to chain files', () => {
    const rankedPaths = ['src/a.ts', 'src/b.ts', 'src/c.ts']; // rank 0.9, 0.5, 0.2 in this order
    const percentiles = new Map([
      ['src/a.ts', 90],
      ['src/b.ts', 50],
      ['src/c.ts', 20],
    ]);
    const chainFiles = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']);

    const result = buildReading(rankedPaths, chainFiles, (p) => percentiles.get(p) ?? null);

    expect(result.reading.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(result.reading.map((r) => r.rank_percentile)).toEqual([90, 50, 20]);
  });

  it('even when the ranked pool is handed in already reversed, the output is NOT re-sorted here — that is the caller\'s contract to uphold', () => {
    const rankedPaths = ['src/c.ts', 'src/b.ts', 'src/a.ts']; // deliberately "reversed" input
    const chainFiles = new Set(rankedPaths);
    const result = buildReading(rankedPaths, chainFiles, () => null);
    expect(result.reading.map((r) => r.path)).toEqual(['src/c.ts', 'src/b.ts', 'src/a.ts']);
  });

  it('restricts to files that are also chain heads — a top-ranked file outside every chain is dropped', () => {
    const rankedPaths = ['src/a.ts', 'src/outside.ts'];
    const chainFiles = new Set(['src/a.ts']);
    const result = buildReading(rankedPaths, chainFiles, () => null);
    expect(result.reading.map((r) => r.path)).toEqual(['src/a.ts']);
  });

  it('empty intersection → a named empty_reason, not a silent empty array', () => {
    const result = buildReading(['src/a.ts'], new Set(), () => null);
    expect(result.reading).toEqual([]);
    expect(result.emptyReason).toBeTruthy();
  });
});
