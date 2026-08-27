import type { CSSProperties } from "react";

export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 } satisfies CSSProperties,
  item: { display: "flex", gap: 11, alignItems: "flex-start" } satisfies CSSProperties,
  badge: {
    width: 20,
    height: 20,
    borderRadius: 99,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    fontSize: 11,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    marginTop: 1,
  } satisfies CSSProperties,
  path: { color: "var(--text-primary)", fontSize: 12.5 } satisfies CSSProperties,
  pathDead: { color: "var(--text-muted)", textDecoration: "line-through", fontSize: 12.5 } satisfies CSSProperties,
  why: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  deadNote: { fontSize: 11.5, color: "var(--text-muted)", marginLeft: 8 } satisfies CSSProperties,
} as const;
