import type { CSSProperties } from "react";

/** Co-located styles for DocViewer. */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: { fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  usedBy: {
    fontSize: 12,
    color: "var(--accent-text)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  body: { padding: 20, maxHeight: 560, overflowY: "auto" } satisfies CSSProperties,
  placeholder: { padding: "60px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  warning: {
    margin: "0 16px 12px",
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 12,
  } satisfies CSSProperties,
} as const;
