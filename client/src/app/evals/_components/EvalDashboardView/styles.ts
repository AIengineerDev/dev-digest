import type { CSSProperties } from "react";

/** Seven columns: agent, cases, three metrics, passed, last run. */
const GRID = "1fr 90px 90px 100px 100px 90px 180px 20px";
const RUN_GRID = "200px 100px 110px 110px 110px 90px";

export const s = {
  page: { padding: "28px 28px 48px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 20 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "6px 0 0",
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 12,
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)" } satisfies CSSProperties,
  row: (last: boolean): CSSProperties => ({
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 12,
    padding: "12px 16px",
    alignItems: "center",
    fontSize: 12.5,
    borderBottom: last ? "none" : "1px solid var(--border)",
  }),
  agentCell: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
  } satisfies CSSProperties,
  agentIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  /* Spans the four metric columns: the agent has no numbers, and four dashes
     would read as four measurements that happened to be empty. */
  neverRun: {
    gridColumn: "span 4",
    textAlign: "center",
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sectionHead: { margin: "28px 0 10px" } satisfies CSSProperties,
  sectionLabel: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  runHeadRow: {
    display: "grid",
    gridTemplateColumns: RUN_GRID,
    gap: 12,
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  runRow: {
    display: "grid",
    gridTemplateColumns: RUN_GRID,
    gap: 12,
    padding: "12px 16px",
    alignItems: "center",
    fontSize: 12.5,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  emptyRuns: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "14px 16px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 10,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  emptyIcon: { color: "var(--text-muted)", marginTop: 1 } satisfies CSSProperties,
  emptyNote: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
} as const;
