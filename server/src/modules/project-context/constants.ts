/** Constants for the project-context module (specs/09-project-context.md). */

/**
 * Extensions discovery walks for. `.mdx` is deliberately excluded — it is
 * code-bearing (JSX embedded in Markdown) and would need a different renderer
 * (spec Q2).
 */
export const DOC_EXTENSIONS = ['.md', '.markdown'] as const;

/**
 * Discovery cap, mirroring `repo-intel`'s `MAX_INDEXED_FILES` (spec NF-scale).
 * Past this the list states it was truncated rather than silently dropping the
 * tail (spec C3).
 */
export const MAX_DOCUMENTS = 1000;

/**
 * In-process token-count cache size, keyed by content hash (spec C5, NF-latency).
 * No table, no migration — nothing in the spec requires the count to survive a
 * restart (plan A2).
 */
export const TOKEN_CACHE_MAX_ENTRIES = 2000;

/**
 * Fraction of an agent's resolved model context window an attached
 * project-context block may occupy before the page warns (R7) and the run-time
 * cap drops the tail of the attachment order (R8). Separate from the skills
 * block's own char budget (spec Q1) — the two cannot share a budget without
 * unifying units.
 */
export const WINDOW_FRACTION = 0.25;

/**
 * Max documents read + tokenised in parallel while building the list response
 * (plan A2). Bounds file-descriptor and CPU use on a repo near `MAX_DOCUMENTS`.
 */
export const DOC_READ_CONCURRENCY = 25;
