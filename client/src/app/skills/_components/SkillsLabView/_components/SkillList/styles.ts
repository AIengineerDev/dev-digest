import type { CSSProperties } from "react";
import { PANE_WIDTH } from "./constants";

/** Co-located styles for SkillList (left pane). */
export const s = {
  pane: {
    width: PANE_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  header: { padding: "14px 14px 10px" } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  } satisfies CSSProperties,
  h1: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: "0 8px 8px" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8, padding: "4px 4px" } satisfies CSSProperties,
} as const;
