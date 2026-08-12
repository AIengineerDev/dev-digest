import type { CSSProperties } from "react";

/** Co-located styles for SkillFromConventionsModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  note: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "9px 12px",
  } satisfies CSSProperties,
  counter: {
    display: "flex",
    justifyContent: "flex-end",
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  over: { color: "var(--crit)" } satisfies CSSProperties,
  error: {
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 12.5,
  } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
