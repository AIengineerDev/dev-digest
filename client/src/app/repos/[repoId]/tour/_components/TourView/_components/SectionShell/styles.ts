import type { CSSProperties } from "react";

/** Co-located styles for SectionShell. */
export const s = {
  section: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    marginBottom: 14,
    overflow: "hidden",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 16px",
    width: "100%",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { fontSize: 14.5, fontWeight: 600, flex: 1, margin: 0 } satisfies CSSProperties,
  chevron: (open: boolean) =>
    ({
      color: "var(--text-muted)",
      transform: open ? "rotate(180deg)" : "none",
      transition: "transform .15s",
      flexShrink: 0,
    }) satisfies CSSProperties,
  panel: { padding: "0 16px 16px" } satisfies CSSProperties,
  marker: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
    marginBottom: 8,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
