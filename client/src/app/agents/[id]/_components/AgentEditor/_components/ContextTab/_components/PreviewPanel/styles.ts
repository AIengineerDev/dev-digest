import type { CSSProperties } from "react";

/** Co-located styles for PreviewPanel. `wrap` is sticky within the tab body's
 *  own `overflow: auto` (AgentEditor/styles.ts:s.body) so the panel stays in
 *  view while the (potentially taller) document list scrolls past it, and
 *  scrolls its own body independently once the document is taller than the
 *  panel's own max height. */
export const s = {
  wrap: {
    position: "sticky",
    top: 0,
    width: 420,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 200px)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 10px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  path: { fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: "break-word" } satisfies CSSProperties,
  close: {
    color: "var(--text-muted)",
    background: "transparent",
    border: "none",
    padding: 4,
    display: "flex",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
  body: { padding: "12px 14px", overflow: "auto", fontSize: 13 } satisfies CSSProperties,
  skeletonLine: { height: 12, borderRadius: 4, marginBottom: 8 } satisfies CSSProperties,
  skeletonLineShort: { height: 12, width: "60%", borderRadius: 4 } satisfies CSSProperties,
} as const;
