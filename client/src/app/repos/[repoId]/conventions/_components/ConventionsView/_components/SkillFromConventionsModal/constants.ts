/** Constants for SkillFromConventionsModal. */

/** Same width as the Skills Lab create modal, so the two read as one family. */
export const MODAL_WIDTH = 720;

/** Tall enough to read a few merged rules with their evidence without scrolling. */
export const BODY_ROWS = 16;

/**
 * Per-skill body limit, in characters.
 *
 * Mirrors `MAX_SKILL_BODY_CHARS` in server/src/modules/skills/constants.ts, for
 * the same reason the Skills Lab copy exists: the server rejects a longer body,
 * and the modal should say so before the round-trip rather than after it.
 */
export const MAX_SKILL_BODY_CHARS = 8000;
