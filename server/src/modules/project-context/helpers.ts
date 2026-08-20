/**
 * project-context — pure domain helpers. No fs, no db, no adapters: every
 * function here takes values and returns values (`helpers-are-pure`).
 */
import { resolve, sep } from 'node:path';
import type { SpecUsed } from '@devdigest/shared';

/**
 * Validate a client-supplied repo-relative path stays inside the clone root
 * before anything reads it (spec R11 — "no path outside the clone root is ever
 * read"; `simple-git.ts`'s `readFile` is a bare `join` with no guard, so this
 * is the containment). Returns `true` when `requestedPath` resolves to the
 * clone root itself or somewhere under it; `false` when `..` or an absolute
 * path would escape it.
 */
export function isPathWithinClone(clonePath: string, requestedPath: string): boolean {
  const root = resolve(clonePath);
  const target = resolve(root, requestedPath);
  return target === root || target.startsWith(root + sep);
}

/** One attachment row, target-agnostic, as the repository returns it. */
export interface AttachmentLike {
  path: string;
  targetKind: 'agent' | 'skill';
  targetId: string;
  order: number;
}

/** A document merged across every attachment row that names it. */
export interface MergedAttachment {
  path: string;
  /** Lowest `order` across every attachment row for this path — the tail-drop
   *  order (R8) and the display order both key off it. */
  order: number;
  /** e.g. `['agent', 'skill:onboarding-rules']` (R6 — both sources listed). */
  sources: string[];
}

/**
 * Merge attachment rows into one entry per document path, deduplicating a
 * document attached through more than one route (R6). `sourceLabel` turns one
 * row into its label (`'agent'` or `'skill:<name>'`) — the caller supplies it
 * because only the caller (which already resolved skill names) knows them.
 */
export function mergeAttachmentsByPath(
  rows: AttachmentLike[],
  sourceLabel: (row: AttachmentLike) => string,
): MergedAttachment[] {
  const byPath = new Map<string, MergedAttachment>();
  for (const row of rows) {
    const label = sourceLabel(row);
    const existing = byPath.get(row.path);
    if (!existing) {
      byPath.set(row.path, { path: row.path, order: row.order, sources: [label] });
      continue;
    }
    existing.order = Math.min(existing.order, row.order);
    if (!existing.sources.includes(label)) existing.sources.push(label);
  }
  return [...byPath.values()].sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.path.localeCompare(b.path),
  );
}

/** One document, ready for the run-time budget split. */
export interface BudgetCandidate {
  path: string;
  sources: string[];
  tokens: number;
}

export interface BudgetSplit {
  /** Kept, in order — what the run actually injects. */
  kept: BudgetCandidate[];
  /** Dropped from the END of the order because the running total would
   *  exceed `budgetTokens` (R8, C12) — never a mid-document truncation. */
  dropped: BudgetCandidate[];
}

/**
 * Split ordered candidates at the point the running token total would exceed
 * `budgetTokens`. Whole documents only — the first one that would overflow,
 * and everything after it in the order, are dropped (R8).
 */
export function splitByBudget(candidates: BudgetCandidate[], budgetTokens: number): BudgetSplit {
  const kept: BudgetCandidate[] = [];
  const dropped: BudgetCandidate[] = [];
  let running = 0;
  let overflowed = false;
  for (const c of candidates) {
    if (!overflowed && running + c.tokens <= budgetTokens) {
      kept.push(c);
      running += c.tokens;
    } else {
      overflowed = true;
      dropped.push(c);
    }
  }
  return { kept, dropped };
}

/** Build a `SpecUsed` row (metadata only — never the document text). */
export function toSpecUsed(path: string, sources: string[], tokens: number, status: SpecUsed['status']): SpecUsed {
  return { path, sources, tokens, status };
}

/** Distinct agent/skill target counts for one document's attachment rows. */
export function countsForPath(rows: AttachmentLike[]): { agent: number; skill: number } {
  const agentIds = new Set<string>();
  const skillIds = new Set<string>();
  for (const r of rows) {
    if (r.targetKind === 'agent') agentIds.add(r.targetId);
    else skillIds.add(r.targetId);
  }
  return { agent: agentIds.size, skill: skillIds.size };
}

/**
 * Run `fn` over `items` with at most `concurrency` in flight — bounds fd/CPU
 * use when the list request reads and tokenises every discovered document
 * (spec NF-latency; plan A2's cold-start measurement).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}
