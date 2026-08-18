/**
 * Constants for the smart-diff module — every threshold and every path pattern
 * that decides a file's role lives here, and nowhere else.
 *
 * The classifier is deliberately data-driven: tuning it is editing this file,
 * not editing control flow. Patterns are matched against the POSIX path exactly
 * as GitHub reports it on `PrFile.path` (forward slashes, repo-relative, no
 * leading `./`).
 */

import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Role precedence, and the path patterns that decide it, now live in
 * `modules/_shared/file-roles.ts` (correction C-1, `plans/10-pr-brief.plan.md`)
 * because `modules/brief/` needs the same classification and
 * `no-cross-module-internals` forbids it importing this module's files
 * directly. Re-exported here, unchanged, so every existing import of
 * `ROLE_ORDER`/`BOILERPLATE_PATTERNS`/`WIRING_PATTERNS` from this file keeps
 * working.
 */
export { ROLE_ORDER, BOILERPLATE_PATTERNS, WIRING_PATTERNS } from '../_shared/file-roles.js';

/** Display order of the groups in the response — highest risk first. */
export const GROUP_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'] as const;

/**
 * A PR at or above EITHER threshold is flagged `too_big` and offered a split.
 *
 * 400 changed lines is where review quality is measured to fall off a cliff
 * (SmartBear/Cisco: defect-detection collapses past ~400 LOC in one sitting);
 * 20 files is the point where the reviewer stops holding the whole change in
 * their head. Boilerplate is excluded from both counts — a lock file does not
 * make a PR hard to review, and counting it would flag every dependency bump.
 */
export const SPLIT_MAX_REVIEWABLE_LINES = 400;
export const SPLIT_MAX_REVIEWABLE_FILES = 20;

/**
 * A proposed split must have at least this many files. A one-file "split" is
 * not a split, it is a file — suggesting it is noise.
 */
export const SPLIT_MIN_FILES_PER_GROUP = 2;

/**
 * How many path segments name a proposed split (`src/modules/pulls` at 3).
 * Two would put all of `src/*` in one bucket; four splits siblings that
 * genuinely belong together.
 */
export const SPLIT_GROUP_DEPTH = 3;

/** Never propose more than this many splits — past it the advice is not advice. */
export const SPLIT_MAX_GROUPS = 5;
