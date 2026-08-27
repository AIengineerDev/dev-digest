import type { CSSProperties } from "react";

/** Co-located styles shared by SkillsTab and AgentsTab. */
export const s = {
  list: { display: "flex", flexDirection: "column", padding: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  name: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 } satisfies CSSProperties,
  note: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { padding: "24px 12px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
} as const;
