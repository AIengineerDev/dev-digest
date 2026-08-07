/**
 * Severities the findings contract actually produces, in display order.
 *
 * Deliberately NOT derived from the UI's `SEV` token map: that carries a fourth
 * level, `INFO`, which no finding ever has (`Severity` in `@devdigest/shared` is
 * a three-value enum), so iterating `SEV` would add a dead `INFO` slot here.
 */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
