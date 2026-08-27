import type { CSSProperties } from "react";

/** Co-located styles for ContextTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", minHeight: 0 } satisfies CSSProperties,
  repoNote: {
    padding: "10px 14px",
    fontSize: 11.5,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", padding: 8, gap: 4 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500 } satisfies CSSProperties,
  note: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { padding: "24px 12px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  skeletonRow: { height: 36, margin: "4px 8px" } satisfies CSSProperties,
} as const;
