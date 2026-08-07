import type { CSSProperties } from "react";

/** Co-located styles for the PR list's FINDINGS cell and its hover tooltip. */
export const s = {
  // The cell is the tooltip's positioning context, so the popover anchors to it.
  cell: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "help",
  } satisfies CSSProperties,
  group: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 11.5,
    fontWeight: 600,
    color,
    borderBottom: `1px dotted ${color}`,
    paddingBottom: 1,
  }),
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

  // Rows near the bottom of the list flip the popover upwards so it stays on screen.
  tooltip: (placement: "up" | "down"): CSSProperties => ({
    position: "absolute",
    left: 0,
    ...(placement === "up" ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 }),
    zIndex: 30,
    width: 360,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    cursor: "default",
    textAlign: "left",
  }),
  tooltipHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 9,
  } satisfies CSSProperties,
  tooltipBody: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
    maxHeight: 300,
    overflow: "auto",
  } satisfies CSSProperties,
  tooltipItem: (divided: boolean): CSSProperties => ({
    paddingBottom: divided ? 9 : 0,
    borderBottom: divided ? "1px solid var(--border)" : "none",
  }),
  tooltipTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  tooltipTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  tooltipMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "5px 0 0",
  } satisfies CSSProperties,
  tooltipLocation: { fontSize: 11, color: "var(--accent-text)" } satisfies CSSProperties,
  tooltipRationale: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    marginTop: 5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
} as const;
