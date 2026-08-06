import type { FindingActionKind } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/**
 * Severities the findings contract actually produces, in display order.
 *
 * Deliberately NOT derived from the UI's `SEV` token map: that carries a fourth
 * level, `INFO`, which no finding ever has (`@devdigest/shared` → `Severity` is a
 * three-value enum). Iterating `SEV` to build the counters would render a chip
 * reading "0 INFO" forever.
 */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export type FilterableSeverity = (typeof SEVERITIES)[number];

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
