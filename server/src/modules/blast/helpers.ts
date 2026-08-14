/**
 * Pure mapping: the repo-intel facade's `BlastResult` → the `BlastRadius`
 * contract the UI and the MCP tool both read.
 *
 * The two shapes disagree in one substantive way, and this file is where that
 * is resolved: `BlastResult.callers` is a flat list tagged with `viaSymbol`,
 * while `BlastRadius.downstream` is grouped per changed symbol. Everything else
 * here is renaming and capping.
 */

import type { BlastRadius, BlastCaller, DownstreamImpact } from '@devdigest/shared';
import {
  MAX_CALLERS_PER_SYMBOL,
  MAX_CHANGED_SYMBOLS,
  MAX_ENDPOINTS_PER_SYMBOL,
} from './constants.js';

/** The subset of the facade's result this mapping reads, declared structurally
 *  so `helpers.ts` stays free of a module import it is not allowed to make. */
export interface BlastResultLike {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number }[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: string;
}

const uniq = (xs: string[]): string[] => [...new Set(xs)];

/**
 * Endpoints and crons reachable from a set of caller files.
 *
 * With `factsByFile` (the persistent index) this is real attribution: only the
 * endpoints declared in the files that actually call this symbol. Without it
 * the facade only produced a flat union over the whole change, and there is no
 * per-symbol truth to report — so every symbol gets the union and
 * `summarize` says the attribution is approximate. Silently reporting zero
 * would be worse: the endpoints are real, only their owner is unknown.
 */
function factsFor(
  callerFiles: string[],
  result: BlastResultLike,
): { endpoints: string[]; crons: string[] } {
  if (!result.factsByFile) return { endpoints: uniq(result.impactedEndpoints), crons: [] };
  const endpoints: string[] = [];
  const crons: string[] = [];
  for (const file of callerFiles) {
    const facts = result.factsByFile[file];
    if (!facts) continue;
    endpoints.push(...facts.endpoints);
    crons.push(...facts.crons);
  }
  return { endpoints: uniq(endpoints), crons: uniq(crons) };
}

/** Human-readable one-liner. Counts are pre-truncation, deliberately: the card
 *  shows "12 callers" and lists three, and those two must not contradict. */
export function summarize(
  totals: { symbols: number; callers: number; endpoints: number },
  opts: { degraded?: boolean; noFiles?: boolean },
): string {
  if (opts.noFiles) return 'No changed files recorded for this PR — open it once to import its diff.';
  if (totals.symbols === 0) {
    return opts.degraded
      ? 'No indexed symbols for the changed files. The repo index is unavailable, so this is a floor, not a finding.'
      : 'No exported symbols changed — the diff touches no declaration this index knows about.';
  }
  const parts = [
    `${totals.symbols} changed ${totals.symbols === 1 ? 'symbol' : 'symbols'}`,
    `${totals.callers} ${totals.callers === 1 ? 'caller' : 'callers'}`,
    `${totals.endpoints} ${totals.endpoints === 1 ? 'endpoint' : 'endpoints'}`,
  ];
  const note = opts.degraded
    ? ' Index degraded: callers are best-effort and endpoint attribution is approximate.'
    : '';
  return `${parts.join(' · ')}.${note}`;
}

export function toBlastRadius(result: BlastResultLike, opts: { noFiles?: boolean } = {}): BlastRadius {
  // Group the flat caller list by the changed symbol it reaches. Built over
  // every caller, then capped per symbol, so the counts below are honest.
  const byVia = new Map<string, BlastResultLike['callers']>();
  for (const c of result.callers) {
    const bucket = byVia.get(c.viaSymbol);
    if (bucket) bucket.push(c);
    else byVia.set(c.viaSymbol, [c]);
  }

  const downstream: DownstreamImpact[] = [];
  const allEndpoints = new Set<string>();

  for (const sym of result.changedSymbols) {
    const rows = byVia.get(sym.name) ?? [];
    const { endpoints, crons } = factsFor(uniq(rows.map((r) => r.file)), result);
    for (const e of endpoints) allEndpoints.add(e);

    const callers: BlastCaller[] = rows
      // Nearest-first inside a file, then by file, so the list is stable across
      // requests — the index does not guarantee an order.
      .slice()
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
      .slice(0, MAX_CALLERS_PER_SYMBOL)
      .map((r) => ({ name: r.symbol, file: r.file, line: r.line }));

    downstream.push({
      symbol: sym.name,
      callers,
      endpoints_affected: endpoints.slice(0, MAX_ENDPOINTS_PER_SYMBOL),
      crons_affected: crons.slice(0, MAX_ENDPOINTS_PER_SYMBOL),
    });
  }

  // Most-called first: the symbol with thirty callers is the one the reviewer
  // has to think hardest about, whatever order the index walked the files in.
  downstream.sort((a, b) => b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol));

  const summary = summarize(
    {
      symbols: result.changedSymbols.length,
      callers: result.callers.length,
      endpoints: allEndpoints.size,
    },
    { degraded: result.degraded, ...opts },
  );

  return {
    changed_symbols: result.changedSymbols
      .slice(0, MAX_CHANGED_SYMBOLS)
      .map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream: downstream.slice(0, MAX_CHANGED_SYMBOLS),
    summary,
  };
}
