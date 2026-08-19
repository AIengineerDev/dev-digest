import type { GitClient, RepoRef } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { contentHash, TokenCountCache } from './token-cache.js';

/**
 * Reads a document through the git port and counts it through the ONE
 * tokenizer, cached by content hash (spec C5, R3; plan A2). Split out from
 * `service.ts` so it is testable without a database: it takes the git port and
 * the tokenizer directly, not a `Container` or a repository.
 */
export class DocumentTokenCounter {
  private cache = new TokenCountCache();

  constructor(
    private git: GitClient,
    private tokenizer: Tokenizer,
  ) {}

  /** Read + count a document. `null` when it can't be read — never thrown
   *  (spec C7: an unreadable document is skipped, not a failure). */
  async countPath(ref: RepoRef, path: string): Promise<number | null> {
    try {
      const content = await this.git.readFile(ref, path);
      return this.countContent(content);
    } catch {
      return null;
    }
  }

  /** Count already-read content, from `container.tokenizer.count` and nowhere
   *  else (`server/INSIGHTS.md`, 2026-08-09 — "the repo has exactly one
   *  counter"), cached by content hash so a repeat request re-tokenises nothing. */
  countContent(content: string): number {
    const hash = contentHash(content);
    const cached = this.cache.get(hash);
    if (cached !== undefined) return cached;
    const tokens = this.tokenizer.count(content);
    this.cache.set(hash, tokens);
    return tokens;
  }
}
