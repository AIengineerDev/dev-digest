import type { CSSProperties } from "react";

/** Co-located styles for the shared eval-case list.
 *  Design: design-mocks/src/06-components2.jsx:43. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowName: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  rowMeta: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: (shown: boolean): CSSProperties => ({
    display: "flex",
    gap: 2,
    opacity: shown ? 1 : 0.4,
  }),
} as const;
