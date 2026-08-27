import type { CSSProperties } from "react";

/** Co-located styles for the Agent Editor → Context tab. */
export const s = {
  // `outer` holds the document list beside the (optional) PreviewPanel:
  // `wrap` keeps its own maxWidth so the list reads the same whether or not
  // the panel is open, and flex naturally gives the panel the remaining
  // width without either column needing to know about the other's state.
  outer: { display: "flex", gap: 16, alignItems: "flex-start" } satisfies CSSProperties,
  wrap: { maxWidth: 760, minWidth: 0, flex: "1 1 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: 220 } satisfies CSSProperties,
  explanation: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  repoNote: { fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  row: (dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: dragging ? 0.45 : 1,
  }),
  handle: (draggable: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    cursor: draggable ? "grab" : "not-allowed",
    display: "flex",
    flexShrink: 0,
    background: "transparent",
    border: "none",
    padding: 0,
  }),
  pathWrap: { flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  filename: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" } satisfies CSSProperties,
  directory: {
    fontSize: 11,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  categoryBadge: (color: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 7px",
    borderRadius: 4,
    flexShrink: 0,
  }),
  tokens: {
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
    minWidth: 34,
    textAlign: "right",
  } satisfies CSSProperties,
  preview: {
    fontSize: 11.5,
    color: "var(--accent-text)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 3,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
  note: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { padding: "24px 12px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  skeletonRow: { height: 36, borderRadius: 7 } satisfies CSSProperties,
} as const;
