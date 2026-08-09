/** Constants for the conventions module. */

/**
 * How many rank-ordered source files to sample. `getConventionSamples` already
 * strips tests, configs and migrations, so these are the files that carry the
 * repo's actual style. Twelve is the number in the spec: enough for a pattern to
 * repeat (one occurrence is a coincidence, not a convention) and small enough to
 * stay inside a cheap model's context alongside the config files.
 */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Config files added to the sample by name.
 *
 * They are NOT in `getConventionSamples` — rank deliberately drops configs — yet
 * they are where a repo states its rules outright (`"strict": true`, a lint rule,
 * a formatter width). Missing files are skipped silently; this is a candidate
 * list, not a requirement.
 */
export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  '.editorconfig',
] as const;

/** Per-file character budget. Files are truncated, never dropped, at this size. */
export const MAX_FILE_SAMPLE_CHARS = 6_000;

/** Ceiling for the whole sample block sent to the model. */
export const MAX_TOTAL_SAMPLE_CHARS = 60_000;

/**
 * Candidates below this confidence are dropped before they are persisted.
 *
 * The model's own number is weak evidence, but it is monotone enough to cut the
 * long tail of "possibly, in some files" guesses, and a candidate a human has to
 * read costs more attention than it is worth at 0.3.
 */
export const MIN_CONFIDENCE = 0.5;

/** Hard cap on how many candidates one scan may persist. */
export const MAX_CANDIDATES = 16;

/** Names the structured-output tool/schema; also the mock LLM's fixture key. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Temperature for extraction. Low: this is a reading task, not a writing one. */
export const EXTRACTION_TEMPERATURE = 0.1;

/** Ceiling for the extraction response. */
export const EXTRACTION_MAX_TOKENS = 4_000;

/** Default skill type for an extracted convention bundle. */
export const CONVENTIONS_SKILL_TYPE = 'convention' as const;
