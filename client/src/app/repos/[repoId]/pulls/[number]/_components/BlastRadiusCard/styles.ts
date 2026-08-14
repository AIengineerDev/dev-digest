import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard. */
export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  statRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  stat: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  statNum: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  summary: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  symbolRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 2px",
    borderTop: "1px solid var(--border)",
    background: "none",
    border: "none",
    borderTopStyle: "solid",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    color: "inherit",
  } satisfies CSSProperties,
  symbolGlyph: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolCount: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "2px 0 8px 20px",
  } satisfies CSSProperties,
  callerRow: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  callerLoc: { color: "var(--text-muted)" } satisfies CSSProperties,
  endpointRow: { fontSize: 12, color: "var(--ok)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  legend: {
    display: "flex",
    gap: 16,
    padding: "10px 4px 0",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  graphWrap: { width: "100%", overflowX: "auto" } satisfies CSSProperties,
} as const;

export function legendDot(color: string): CSSProperties {
  return { width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 };
}
