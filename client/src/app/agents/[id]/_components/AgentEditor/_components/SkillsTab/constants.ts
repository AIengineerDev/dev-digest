import type { SkillType } from "@devdigest/shared";

/** Badge colour per skill type — matches design-mocks/src/17-screen_agents.jsx. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** How many skeleton rows to show while the two queries resolve. */
export const SKELETON_ROWS = 4;

/** dataTransfer key used by the drag-to-reorder handles. */
export const DRAG_MIME = "text/x-devdigest-skill-id";
