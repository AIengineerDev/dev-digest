import type { ContextCategory } from "./helpers";

/** Skeleton row count while the document list (`GET /repos/:id/context`) is
 *  loading. Matches the skills-side ContextTab's own constant. */
export const SKELETON_ROWS = 3;

/** Badge colour per derived category (helpers.ts:categoryForPath). Arbitrary
 *  but stable — picked to read distinctly from the severity/status colours
 *  used elsewhere (`--crit`, `--warn`, `--accent`), since a category tag is
 *  neither. */
export const CATEGORY_COLOR: Record<ContextCategory, string> = {
  readme: "#3b82f6",
  specs: "#8b5cf6",
  insights: "#10b981",
  docs: "#999999",
};
