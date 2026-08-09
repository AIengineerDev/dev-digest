/** Constants for SkillsLabView and its panes. */

/** Query-string key holding the selected skill id, so a selection is shareable. */
export const SELECTED_PARAM = "skill";

/**
 * Per-skill body limit, in characters.
 *
 * Mirrors `MAX_SKILL_BODY_CHARS` in server/src/modules/skills/constants.ts — the
 * server rejects a longer body, and this constant exists so the editor and the
 * create modal can say so before the round-trip. If the server's number changes,
 * change this one: @devdigest/shared carries contracts, not configuration.
 */
export const MAX_SKILL_BODY_CHARS = 8000;
