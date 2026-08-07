import type { CSSProperties } from "react";

/** Co-located styles for the PR list's FINDINGS cell. */
export const s = {
  cell: { display: "inline-flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  group: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 11.5,
    fontWeight: 600,
    color,
  }),
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
