/**
 * Filesystem-walk limits shared by `repo-intel`'s code-index walk and
 * `project-context`'s markdown discovery walk.
 *
 * Lives in `_shared` rather than `repo-intel/constants.ts`, which owns it
 * historically: `modules/project-context` needs the same exclusion set and
 * size ceiling, and `no-cross-module-internals` forbids one module importing
 * another module's `constants.ts`. A copied list would drift silently — the
 * exact failure mode this file exists to avoid is `EXCLUDED_DIRS` starting to
 * list `node_modules` in one module and not the other.
 *
 * `repo-intel/constants.ts` re-exports both names from here so its existing
 * importers (`pipeline/walk.ts`, `test/indexer-walk.test.ts`) are unchanged.
 */

/** Directories never walked by either module's discovery. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

/** Files larger than this are skipped (counted, not read/indexed). */
export const MAX_FILE_SIZE = 400 * 1024; // 400 KB
