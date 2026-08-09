import type { CSSProperties } from "react";
import { DISABLED_OPACITY } from "./constants";

/** Co-located styles for SkillListItem. */
export const s = {
  row: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 7,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--border-strong)" : "transparent"}`,
    background: active ? "var(--bg-hover)" : "transparent",
    opacity: enabled ? 1 : DISABLED_OPACITY,
    marginBottom: 2,
    width: "100%",
    textAlign: "left",
  }),
  top: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  description: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 4,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  badges: { display: "flex", gap: 6, marginTop: 7, alignItems: "center" } satisfies CSSProperties,
  typeBadge: (color: string, bg: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: bg,
    padding: "1px 6px",
    borderRadius: 4,
  }),
  sourceBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
