/**
 * Intent module constants (specs/04-intent-layer.md).
 */

/** Bumped whenever `fingerprintSignals`'s input shape changes meaningfully
 *  enough that a cached classification should not be trusted. */
export const TAXONOMY_VERSION = 1;

/** Bumped whenever the intent classification prompt changes meaningfully. */
export const INTENT_PROMPT_VERSION = 1;

/** Whole signal-collection step budget (source calls run in parallel under this). */
export const SIGNAL_COLLECTION_BUDGET_MS = 15_000;

/** Model call budget — far below the adapter's 240s and the job runner's 300s
 *  (see test/timeout-budget.test.ts). Never touch DEFAULT_TIMEOUT/DEFAULT_JOB_TIMEOUT. */
export const INTENT_MODEL_TIMEOUT_MS = 45_000;

export const INTENT_MODEL_MAX_TOKENS = 700;
export const INTENT_MODEL_TEMPERATURE = 0;
export const INTENT_MODEL_MAX_RETRIES = 1;

/** Commit subjects considered (oldest excess dropped, not newest). */
export const MAX_COMMIT_SUBJECTS = 30;
export const MAX_COMMIT_SUBJECT_CHARS = 120;

/** Referenced in-repo docs: allowlisted extensions, size and count caps. */
export const DOC_ALLOWED_EXTENSIONS = ['.md', '.mdx', '.txt'] as const;
export const MAX_DOC_BYTES = 8 * 1024;
export const MAX_DOCS = 2;

/** Prompt budget for the rendered `## Stated intent` block. */
export const MAX_INTENT_CHARS = 1200;
export const MAX_INTENT_SCOPE_BULLETS = 5;
export const MAX_INTENT_BULLET_CHARS = 120;

export const EXTRACTION_SCHEMA_NAME = 'DerivedIntentClassification';
