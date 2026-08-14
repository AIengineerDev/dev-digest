import { describe, it, expect } from 'vitest';
import { capCallersPerSymbol } from '../src/modules/repo-intel/helpers.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastCallerRow } from '../src/modules/repo-intel/types.js';

/**
 * Regression: the blast caller cap is PER CHANGED SYMBOL, not over the flat
 * list.
 *
 * `tryPersistentBlast` used to end with `callers.slice(0, MAX_CALLERS_PER_SYMBOL)`,
 * which spends the whole budget on whichever symbols sort first and leaves
 * every other changed symbol reporting zero callers — indistinguishable from
 * "nothing depends on this". Found live: two unrelated PRs (85 and 51 changed
 * symbols) both reported exactly 20 callers.
 */

const row = (viaSymbol: string, i: number, rank = 0): BlastCallerRow => ({
  file: `src/caller${i}.ts`,
  symbol: `caller${i}`,
  viaSymbol,
  line: i,
  rank,
});

describe('capCallersPerSymbol', () => {
  it('gives every changed symbol its own budget', () => {
    const callers = [
      ...Array.from({ length: 30 }, (_, i) => row('hot', i)),
      ...Array.from({ length: 3 }, (_, i) => row('cold', 100 + i)),
    ];
    const capped = capCallersPerSymbol(callers, 5);

    const perSymbol = new Map<string, number>();
    for (const c of capped) perSymbol.set(c.viaSymbol, (perSymbol.get(c.viaSymbol) ?? 0) + 1);
    expect(perSymbol.get('hot')).toBe(5);
    // The bug: `cold` came after 30 `hot` rows, so a flat slice dropped it
    // entirely and the symbol looked uncalled.
    expect(perSymbol.get('cold')).toBe(3);
  });

  it('keeps the highest-ranked callers of each symbol, given rank-sorted input', () => {
    const callers = [row('x', 1, 9), row('x', 2, 8), row('x', 3, 7)];
    expect(capCallersPerSymbol(callers, 2).map((c) => c.rank)).toEqual([9, 8]);
  });

  it('passes short lists through untouched', () => {
    const callers = [row('a', 1), row('b', 2)];
    expect(capCallersPerSymbol(callers)).toEqual(callers);
  });

  it('defaults to the module cap', () => {
    const callers = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 7 }, (_, i) => row('one', i));
    expect(capCallersPerSymbol(callers)).toHaveLength(MAX_CALLERS_PER_SYMBOL);
  });

  it('does not reorder what it keeps', () => {
    const callers = [row('a', 1), row('b', 2), row('a', 3), row('b', 4)];
    expect(capCallersPerSymbol(callers, 2).map((c) => c.line)).toEqual([1, 2, 3, 4]);
  });
});
