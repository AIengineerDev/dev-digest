/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Severity → CSS colour token, matching FindingCard so a finding is the same
 *  colour in the panel and in the diff. */
export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

/** Fallback colour for a severity the client does not know yet. */
export const SEVERITY_COLOR_FALLBACK = "var(--text-muted)";

/**
 * When to re-aim the scroll at a revealed line, in ms after the first attempt.
 *
 * Revealing the stale findings expands every file that carries one, so the page
 * keeps growing under a scroll that has already run — the target ends up above
 * or below the viewport. Same reason the Findings tab re-aims at a revealed
 * card (`components/finding-card/constants.ts`).
 */
export const REVEAL_RETRY_DELAYS_MS = [120, 600] as const;
