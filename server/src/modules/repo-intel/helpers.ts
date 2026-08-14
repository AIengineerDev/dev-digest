/**
 * Pure helpers for repo-intel. No database, no adapters — see the
 * `helpers-are-pure` rule in `.dependency-cruiser.cjs`.
 */

import { MAX_CALLERS_PER_SYMBOL } from './constants.js';
import type { BlastCallerRow } from './types.js';

/**
 * Keep at most `limit` callers **per changed symbol**.
 *
 * The input must already be rank-sorted: this takes the first N it sees for
 * each `viaSymbol`, so "first" has to mean "most important".
 *
 * This exists as its own function because the obvious one-liner is wrong in a
 * way that is invisible on small inputs. `callers.slice(0, limit)` caps the
 * FLAT list, so a PR touching many symbols spends the whole budget on the
 * first one or two and every other changed symbol reports zero callers — which
 * reads as "nothing depends on this", the opposite of the truth. It shows up
 * only once a PR has more changed symbols than the cap.
 */
export function capCallersPerSymbol(
  callers: readonly BlastCallerRow[],
  limit: number = MAX_CALLERS_PER_SYMBOL,
): BlastCallerRow[] {
  const perSymbol = new Map<string, number>();
  const out: BlastCallerRow[] = [];
  for (const c of callers) {
    const n = perSymbol.get(c.viaSymbol) ?? 0;
    if (n >= limit) continue;
    perSymbol.set(c.viaSymbol, n + 1);
    out.push(c);
  }
  return out;
}
