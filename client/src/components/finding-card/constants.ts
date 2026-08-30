/** Constants for FindingCard. */

/** Severity → CSS colour token. */
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Fallback colour for an unknown severity. */
export const SEV_COLOR_FALLBACK = "var(--text-muted)";

/**
 * When to RE-aim the scroll at a revealed finding, in ms after the first
 * attempt (which happens immediately).
 *
 * More than one attempt because the Findings tab is still mounting siblings and
 * rendering markdown while the first one runs, so the page it aimed at is not
 * the page the reader ends up on. The last retry is late enough to be after the
 * settling and early enough not to fight a reader who has started scrolling
 * themselves.
 */
export const REVEAL_RETRY_DELAYS_MS = [120, 600] as const;
