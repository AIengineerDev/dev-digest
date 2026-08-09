/** Constants for SkillListItem. */

import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/**
 * Type badge colours, copied verbatim from the SKILL_TYPE map in
 * design-mocks/src/14-screen_skills.jsx — the design owns these hues, so they
 * are literals here rather than theme tokens.
 */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Alpha suffix that turns a badge colour into its 10%-opacity background. */
export const BADGE_BG_ALPHA = "1a";

/** Source badge icons, from the mock's SKILL_SOURCE map. v1 only ever writes 'manual'. */
export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Link",
};

/** Opacity applied to a globally disabled row (mock: 0.55). */
export const DISABLED_OPACITY = 0.55;

/** Toggle size in the row, per the mock. */
export const TOGGLE_SIZE = 13;
