/** Constants for the Onboarding Tour screen (specs/12-onboarding-generator.md). */
import type { OnboardingSectionKind } from "@devdigest/shared";

/** The screen is a two-pane rail/content layout, matching Project Context. */
export const CONTENT_MAX_WIDTH = 1080;

/** "On this page" rail width. */
export const RAIL_WIDTH = 180;

/** Rows to show as loading placeholders while the tour is first fetching. */
export const SKELETON_ROWS = 6;

/**
 * Fixed section order (B2.2 / R24) — read from this constant, never from the
 * record's array order, so a model response or a partial generation cannot
 * reorder the page.
 */
export const SECTION_ORDER: OnboardingSectionKind[] = [
  "architecture_overview",
  "critical_paths",
  "how_to_run",
  "guided_reading",
  "first_tasks",
];
