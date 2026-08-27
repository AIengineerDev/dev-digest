import type { CSSProperties } from "react";

export const s = {
  diagramWrap: { marginTop: 12 } satisfies CSSProperties,
  // Visually hidden but present to assistive tech — the rendered mermaid
  // <svg> carries no accessible name of its own (Accessibility NFR).
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  treeList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 } satisfies CSSProperties,
  treeRow: {
    padding: "8px 11px",
    borderRadius: 7,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  treePath: { fontSize: 12.5, color: "var(--text-primary)" } satisfies CSSProperties,
  treeMeta: { fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 } satisfies CSSProperties,
  treeNote: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
} as const;
