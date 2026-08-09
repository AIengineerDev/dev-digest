import type { CSSProperties } from "react";

/** Co-located styles for SkillsLabView (two panes: list + editor). */
export const s = {
  // 52px is the AppFrame top bar; the panes scroll inside the remaining height.
  panes: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  centre: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  centrePlaceholder: {
    flex: 1,
    display: "grid",
    placeItems: "center",
  } satisfies CSSProperties,
  centreSkeleton: {
    flex: 1,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
} as const;
