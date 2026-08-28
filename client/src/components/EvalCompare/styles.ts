import type { CSSProperties } from "react";

/** Co-located styles for the shared run-comparison modal. */
export const s = {
  // --- compare -------------------------------------------------------------
  selectCell: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  compareBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  } satisfies CSSProperties,
  compareHint: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  compareBody: { padding: 18, display: "grid", gap: 18 } satisfies CSSProperties,
  deltaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  deltaCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    display: "grid",
    gap: 4,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  deltaRow: { display: "flex", alignItems: "baseline", gap: 6 } satisfies CSSProperties,
  deltaFrom: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  deltaArrow: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  deltaTo: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  deltaPts: (up: boolean | null): CSSProperties => ({
    fontSize: 11.5,
    color: up === null ? "var(--text-muted)" : up ? "var(--ok)" : "var(--crit)",
  }),
  promptHead: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  promptNote: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  promptDiff: {
    margin: 0,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    fontSize: 12,
    lineHeight: 1.55,
    maxHeight: 320,
    overflow: "auto",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "same"): CSSProperties => ({
    color:
      kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-secondary)",
    background:
      kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),
} as const;
