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
  // Two columns side by side, stacking below ~560px: the pair is a comparison,
  // and a comparison squeezed into two 130px columns stops being readable.
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    marginTop: 4,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  scopeCol: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  scopeTitle: (tone: "in" | "out"): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: tone === "in" ? "var(--ok)" : "var(--text-muted)",
  }),
  scopeList: {
    margin: 0,
    paddingLeft: 16,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  scopeItem: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  scopeEmpty: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
    margin: 0,
  } satisfies CSSProperties,
  scopeCaution: {
    fontSize: 12,
    color: "var(--warn)",
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
