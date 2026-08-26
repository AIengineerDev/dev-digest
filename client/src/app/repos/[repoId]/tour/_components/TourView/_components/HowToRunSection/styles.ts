import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 } satisfies CSSProperties,
  step: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  index: { fontSize: 11, color: "var(--text-muted)", width: 14, flexShrink: 0 } satisfies CSSProperties,
  commandWrap: { flex: 1, minWidth: 0, overflowX: "auto" } satisfies CSSProperties,
  command: { fontSize: 12, color: "var(--text-primary)", whiteSpace: "pre" } satisfies CSSProperties,
  why: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  copyButton: {
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    width: 24,
    height: 24,
    borderRadius: 5,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
