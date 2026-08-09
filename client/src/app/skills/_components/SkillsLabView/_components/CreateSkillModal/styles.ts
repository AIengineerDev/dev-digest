import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { padding: "18px 22px 4px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "12px 18px",
  } satisfies CSSProperties,
  count: (over: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: over ? "var(--crit)" : "var(--text-muted)",
    fontWeight: over ? 600 : 400,
  }),
  error: { fontSize: 12, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
} as const;
