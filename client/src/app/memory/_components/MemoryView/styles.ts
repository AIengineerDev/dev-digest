/* Memory — the RAG store's human view. Shares the CI Runs table proportions so
   the two GLOBAL screens read as one family. */

import type { CSSProperties } from "react";

export const s = {
  head: { padding: "20px 28px 6px" } as CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } as CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } as CSSProperties,
  table: {
    margin: "12px 28px 40px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
    background: "var(--bg-elevated)",
  } as CSSProperties,
  grid: "110px 120px minmax(260px, 1fr) 100px 150px",
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
  row: { padding: "12px 16px", alignItems: "baseline", fontSize: 12.5, gap: 12 } as CSSProperties,
  content: { fontSize: 12.5, lineHeight: 1.5 } as CSSProperties,
  num: { fontSize: 12, color: "var(--text-secondary)" } as CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
} as const;
