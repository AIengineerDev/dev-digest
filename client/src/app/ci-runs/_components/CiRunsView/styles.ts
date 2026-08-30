/* CI Runs — measurements from `design-mocks/src/23-screen_cizruns.jsx` (N13).
   Column widths are the mock's grid, minus the two columns this build has no
   data for; see CiRunsView.tsx for why. */

import type { CSSProperties } from "react";

export const s = {
  head: { padding: "20px 28px 6px", display: "flex", alignItems: "flex-end", gap: 12 } as CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } as CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } as CSSProperties,
  refresh: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } as CSSProperties,
  live: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } as CSSProperties,
  dot: { width: 6, height: 6, borderRadius: 99, background: "var(--ok)" } as CSSProperties,
  table: {
    margin: "12px 28px 40px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
    background: "var(--bg-elevated)",
  } as CSSProperties,
  grid: "140px minmax(220px, 1fr) 150px 120px 110px 80px 110px",
  headRow: {
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    gap: 12,
  } as CSSProperties,
  row: { padding: "12px 16px", alignItems: "center", fontSize: 12.5, gap: 12 } as CSSProperties,
  ts: { fontSize: 11, color: "var(--text-secondary)" } as CSSProperties,
  prNum: { fontSize: 11, color: "var(--accent-text)" } as CSSProperties,
  prTitle: {
    fontSize: 12.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as CSSProperties,
  agent: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } as CSSProperties,
  num: { fontSize: 12, color: "var(--text-secondary)" } as CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
} as const;
