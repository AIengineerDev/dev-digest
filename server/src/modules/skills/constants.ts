/** Constants for the skills module. */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** `source` is always 'manual' in v1 — import/extraction are out of scope. */
export const DEFAULT_SKILL_SOURCE = 'manual' as const;

/**
 * Budget limits.
 *
 * Both numbers are PROPOSALS from specs/02-skills.md, not measurements: nothing
 * has been sized against a real assembled prompt yet. Treat them as constants to
 * revise once the seed skills exist and the run trace shows the true cost of the
 * `## Skills / rules` block — they are not a contract.
 */

/** Max characters in one skill body, validated on create/update. */
export const MAX_SKILL_BODY_CHARS = 8000;

/** Max characters for the whole assembled `## Skills / rules` block. */
export const MAX_SKILLS_BLOCK_CHARS = 24000;

/** Import: only these schemes are fetchable. */
export const IMPORT_ALLOWED_PROTOCOLS = ['http:', 'https:'] as const;

/** Import: hard read cap, applied even when `content-length` is absent or lies. */
export const IMPORT_MAX_BYTES = 64_000;

/** Import: give up on a slow host rather than holding the request open. */
export const IMPORT_TIMEOUT_MS = 10_000;

/**
 * Sources whose body is data from outside this workspace and is therefore
 * wrapped in `<untrusted>` when it reaches a prompt.
 *
 * `manual` and `extracted` are not here on purpose: both are authored inside the
 * workspace — extraction proposes, but a maintainer accepts each rule before it
 * becomes a skill — and wrapping them would tell the model to treat its own
 * instructions as data. See `specs/02-skills.md`, *Security*.
 */
export const UNTRUSTED_SKILL_SOURCES = ['imported_url', 'community'] as const;
