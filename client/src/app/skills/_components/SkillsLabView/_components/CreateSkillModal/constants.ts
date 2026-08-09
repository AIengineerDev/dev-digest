/** Constants for CreateSkillModal. */

import type { SkillType } from "@devdigest/shared";

/** Modal width, matching the create-agent modal so the two read as one family. */
export const MODAL_WIDTH = 640;

/** Type options offered on create. Mirrors the `SkillType` enum in @devdigest/shared. */
export const TYPE_OPTIONS: SkillType[] = ["rubric", "convention", "security", "custom"];

/** Default type: "custom" claims the least about a body nobody has written yet. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Rows in the body textarea — tall enough to see a short rule whole. */
export const BODY_ROWS = 10;
