/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process. Originally scoped to modules/repo-intel only; widened
 * deliberately for specs/09-project-context.md (plan A2) — `container.tokenizer`
 * is reached the same way from `modules/project-context` (list/detail token
 * counts, and the assembler's run-time budget), and `pnpm arch` does not
 * restrict it: this file is a stateless helper (no credentials, no network),
 * exempt from `injected-adapters-only-from-container`. It stays the ONE
 * counter in the repo — `server/INSIGHTS.md` (2026-08-09) already rejected a
 * second, cheaper estimator; do not add one for a new caller either.
 * Swappable in tests via a mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      return this.enc.encode(text).length;
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }
}
