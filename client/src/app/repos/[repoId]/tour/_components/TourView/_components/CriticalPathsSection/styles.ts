import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 12, marginTop: 4 } satisfies CSSProperties,
  chain: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  why: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  files: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 } satisfies CSSProperties,
  filePath: { color: "var(--text-primary)" } satisfies CSSProperties,
  filePathDead: {
    color: "var(--text-muted)",
    textDecoration: "line-through",
  } satisfies CSSProperties,
  deadNote: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  endpoints: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } satisfies CSSProperties,
  endpoint: { fontSize: 11.5 } satisfies CSSProperties,
} as const;
