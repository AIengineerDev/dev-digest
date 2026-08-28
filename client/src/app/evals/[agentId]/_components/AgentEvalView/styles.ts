import type { CSSProperties } from "react";

/** Co-located styles for the per-agent Eval Dashboard.
 *  Design: design-mocks/src/14-screen_skills.jsx:131. */
const COLS = "150px 70px 1fr 1fr 1fr 90px 80px";

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", marginBottom: 18 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  headActions: {
    marginLeft: "auto",
    display: "flex",
    gap: 8,
    alignItems: "center",
  } satisfies CSSProperties,

  alert: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "11px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 18,
  } satisfies CSSProperties,
  alertText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  alertStrong: { color: "var(--text-primary)" } satisfies CSSProperties,

  cards: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  legend: {
    marginLeft: "auto",
    display: "flex",
    gap: 14,
    fontSize: 11.5,
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  swatch: (c: string): CSSProperties => ({ width: 10, height: 2, background: c, borderRadius: 2 }),
  chartHead: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 12,
  } satisfies CSSProperties,

  table: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  th: {
    display: "grid",
    gridTemplateColumns: COLS,
    gap: 12,
    padding: "9px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  tr: (last: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: COLS,
    gap: 12,
    padding: "10px 16px",
    borderBottom: last ? "none" : "1px solid var(--border)",
    alignItems: "center",
    fontSize: 12.5,
  }),
  ranAt: { color: "var(--text-secondary)", fontSize: 11.5 } satisfies CSSProperties,
  version: { color: "var(--accent-text)" } satisfies CSSProperties,
  pass: { fontWeight: 600 } satisfies CSSProperties,
  cost: { color: "var(--text-secondary)" } satisfies CSSProperties,

  bar: { display: "flex", alignItems: "center", gap: 7 } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  barFill: (v: number, c: string): CSSProperties => ({
    width: `${Math.round(v * 100)}%`,
    height: "100%",
    background: c,
    borderRadius: 3,
  }),
  barNum: { fontSize: 11.5, color: "var(--text-secondary)" } satisfies CSSProperties,

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
