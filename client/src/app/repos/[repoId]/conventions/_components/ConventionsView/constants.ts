import type { ConventionCategory } from "@devdigest/shared";

/** Constants for the Conventions screen. */

/** Confidence at or above which the bar reads as "solid" rather than "maybe". */
export const HIGH_CONFIDENCE = 0.85;

/** Width of the confidence bar, matching the mock (design-mocks/src/25). */
export const CONFIDENCE_BAR_WIDTH = 90;

/** The screen is a reading column, not a dashboard — same 880 as the mock. */
export const CONTENT_MAX_WIDTH = 880;

/** Rows in the rule editor's textarea when a candidate is being edited. */
export const RULE_EDIT_ROWS = 3;

/** Every category the extractor may return, for the edit dropdown. */
export const CATEGORY_OPTIONS: ConventionCategory[] = [
  "naming",
  "structure",
  "error-handling",
  "testing",
  "typing",
  "api",
  "async",
  "logging",
  "imports",
  "security",
];
