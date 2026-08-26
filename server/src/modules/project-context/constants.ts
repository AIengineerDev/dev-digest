/** Constants for the project-context module (specs/09-project-context.md). */

/**
 * `DOC_EXTENSIONS` and `MAX_DOCUMENTS` now live in `_shared/doc-discovery.ts`
 * (specs/12-onboarding-generator.md T2, alongside `discoverDocuments` itself),
 * re-exported here so this module's other importers
 * (`service.ts`, `test/project-context/discovery.test.ts`) are unchanged.
 */
export { DOC_EXTENSIONS, MAX_DOCUMENTS } from '../_shared/doc-discovery.js';

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
