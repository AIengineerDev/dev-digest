/**
 * In-process LRU token-count cache, keyed by content hash (spec C5, NF-latency;
 * plan A2). No table, no migration — nothing in the spec requires a count to
 * survive a restart, and a persisted cache would be a schema change bought on
 * an unmeasured guess.
 *
 * Counts still come from exactly one counter (`container.tokenizer.count`) —
 * this cache only avoids paying for it twice on the same content
 * (`server/INSIGHTS.md`: "the repo has exactly one counter", 2026-08-09).
 */
import { createHash } from 'node:crypto';
import { TOKEN_CACHE_MAX_ENTRIES } from './constants.js';

/** SHA-256 of the content — cheap relative to tokenising, and collision-safe
 *  enough that a cache hit is never trusted to mean "identical" for anything
 *  more sensitive than an integer token count. */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class TokenCountCache {
  private map = new Map<string, number>();

  constructor(private maxEntries: number = TOKEN_CACHE_MAX_ENTRIES) {}

  get(hash: string): number | undefined {
    const hit = this.map.get(hash);
    if (hit === undefined) return undefined;
    // Re-insert to mark most-recently-used (Map iteration order = insertion order).
    this.map.delete(hash);
    this.map.set(hash, hit);
    return hit;
  }

  set(hash: string, tokens: number): void {
    if (this.map.has(hash)) this.map.delete(hash);
    else if (this.map.size >= this.maxEntries) {
      // Evict the oldest (first) entry.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(hash, tokens);
  }

  get size(): number {
    return this.map.size;
  }
}
