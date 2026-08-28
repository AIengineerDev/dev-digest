import type { CSSProperties } from "react";

/** Co-located styles for the Skill Editor → Evals tab. */
export const s = {
  pad: { padding: 14, display: "grid", gap: 14 } satisfies CSSProperties,
  intro: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  group: { display: "grid", gap: 6 } satisfies CSSProperties,
  groupHead: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  groupName: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  groupCount: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  groupActions: { marginLeft: "auto", display: "flex", gap: 6 } satisfies CSSProperties,
} as const;
