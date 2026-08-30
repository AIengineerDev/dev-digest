import type { CSSProperties } from "react";

/** Co-located styles for ConflictsSection (design-mocks/src/19-screen_multiagent.jsx:21-40). */
export const s = {
  wrapper: { marginTop: 22 } satisfies CSSProperties,
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  group: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  groupTitle: { fontSize: 13, fontWeight: 600, marginLeft: 6 } satisfies CSSProperties,
  // gap 1 over a --border background IS the 1px separator — not per-cell borders.
  takesGrid: (n: number) =>
    ({
      display: "grid",
      gridTemplateColumns: `repeat(${n}, 1fr)`,
      gap: 1,
      background: "var(--border)",
    }) satisfies CSSProperties,
  cell: { padding: "10px 14px", background: "var(--bg-elevated)" } satisfies CSSProperties,
  cellAgent: { fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } satisfies CSSProperties,
  cellVerdictRow: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 } satisfies CSSProperties,
  dot: (color: string) => ({ width: 7, height: 7, borderRadius: 99, background: color }) satisfies CSSProperties,
  verdict: (flagged: boolean) =>
    ({
      fontSize: 11,
      fontWeight: 600,
      color: flagged ? "var(--text-primary)" : "var(--text-muted)",
      textTransform: flagged ? "uppercase" : "none",
      letterSpacing: flagged ? "0.03em" : 0,
    }) satisfies CSSProperties,
} as const;
