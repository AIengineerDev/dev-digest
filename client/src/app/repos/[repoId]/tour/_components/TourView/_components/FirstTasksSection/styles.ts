import type { CSSProperties } from "react";

export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginTop: 4,
  } satisfies CSSProperties,
  card: {
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, lineHeight: 1.35 } satisfies CSSProperties,
  scope: { fontSize: 11, color: "var(--text-muted)", margin: "7px 0" } satisfies CSSProperties,
  why: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  basis: { fontSize: 11, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
} as const;
