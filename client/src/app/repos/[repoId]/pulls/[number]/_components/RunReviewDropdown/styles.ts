import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown + AgentPickerPopover. */
export const s = {
  wrapper: { position: "relative", display: "inline-block" },
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  heading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" },
  actions: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 },
} satisfies Record<string, CSSProperties>;
