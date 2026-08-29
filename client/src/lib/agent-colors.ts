/**
 * A small categorical palette for telling agents apart at a glance in the
 * multi-agent screens (results columns/tabs, the Configure run picker) — NOT
 * semantic, unlike `--crit`/`--warn`/`--ok` which mean severity on the same
 * screens' finding rows. Assigned by position, cycling; not persisted per
 * agent, since the app has no per-agent color field to persist. Shared by two
 * routes (the results page and Configure run), so it lives here rather than
 * duplicated in either route's folder.
 */
export const AGENT_COLORS = [
  "#3b82f6", // blue
  "#a855f7", // violet
  "#f59e0b", // amber
  "#10b981", // green
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
];

/** Deterministic-by-position color — see AGENT_COLORS' comment. */
export function colorForIndex(i: number): string {
  return AGENT_COLORS[i % AGENT_COLORS.length]!;
}
