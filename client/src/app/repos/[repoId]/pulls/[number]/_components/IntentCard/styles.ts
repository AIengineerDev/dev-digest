import type { CSSProperties } from "react";

export const s = {
  wrap: (muted: boolean): CSSProperties => ({
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    opacity: muted ? 0.75 : 1,
  }),
  headRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    color: "var(--text)",
    lineHeight: 1.5,
    margin: 0,
  } satisfies CSSProperties,
  why: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  unusedList: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: 0,
    paddingLeft: 16,
  } satisfies CSSProperties,
  degradedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  degradedText: {
    fontSize: 13,
    color: "var(--crit)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
