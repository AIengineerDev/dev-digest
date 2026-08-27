/** Constants for PrBriefCard. */

/**
 * Risks shown before the card collapses the rest behind "+N more" (C3). Eight
 * fits the card without the disclosure becoming the dominant thing in it — the
 * same reasoning `BlastRadiusCard`'s `VISIBLE_SYMBOLS` uses, just a different
 * number because a risk pill is taller than a symbol row.
 */
export const RISK_DISPLAY_CAP = 8;

/**
 * Review-focus entries rendered. The spec's Q1 caps the list at 5 — the model
 * is asked for an ordered "read these first" list, not a restatement of every
 * changed file, so this is a data limit passed straight through, not a display
 * fold.
 */
export const FOCUS_DISPLAY_CAP = 5;

/**
 * `what` is a one-paragraph model summary that can still run long. Truncated
 * in the middle (C4) rather than at the end, so both the opening clause and
 * the conclusion stay legible; the full string is always available via the
 * element's `title`.
 */
export const WHAT_MAX_CHARS = 240;

/** A file/endpoint ref longer than this (a deep monorepo path, a long route)
 *  is truncated the same way, for the same reason. */
export const REF_MAX_CHARS = 64;
