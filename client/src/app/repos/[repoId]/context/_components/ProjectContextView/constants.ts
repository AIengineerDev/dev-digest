/** Constants for the Project Context screen (specs/09-project-context.md). */

/** The screen is a two-pane master/detail layout, wide enough for a rendered
 *  document body to read comfortably. */
export const CONTENT_MAX_WIDTH = 1280;

/** Left rail width, matching the mock's 240px column. */
export const RAIL_WIDTH = 280;

/** Rows to show as loading placeholders while the list is first fetching. */
export const SKELETON_ROWS = 6;

/** Per-document size ceiling in bytes, mirrored from
 *  `server/src/modules/_shared/walk-limits.ts`'s `MAX_FILE_SIZE` only for
 *  *display* (the attach-limit copy names the number; the server is still the
 *  one place that enforces it — `too_large` on every `ProjectContextDoc`
 *  already reflects the real check). */
export const MAX_ATTACH_SIZE_KB = 400;
