import type { CSSProperties } from "react";

/** Co-located styles for AgentColumn (design-mocks/src/19-screen_multiagent.jsx:57-63). */
export const s = {
  card: (color: string) =>
    ({
      border: "1px solid var(--border)",
      borderTop: `2px solid ${color}`,
      borderRadius: 9,
      background: "var(--bg-elevated)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      minWidth: 220,
    }) satisfies CSSProperties,
  header: { padding: 12, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 9 } satisfies CSSProperties,
  iconTile: (color: string) =>
    ({
      width: 30,
      height: 30,
      borderRadius: 8,
      display: "grid",
      placeItems: "center",
      background: `${color}1f`,
      color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  meta: { fontSize: 10.5, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { padding: 12, display: "flex", flexDirection: "column", gap: 7, flex: 1 } satisfies CSSProperties,
  footer: {
    padding: "9px 12px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  footerCount: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  errorBox: {
    margin: 12,
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12,
  } satisfies CSSProperties,
  findingRow: (color: string) =>
    ({
      padding: "8px 10px",
      borderRadius: 6,
      background: "var(--bg-surface)",
      borderLeft: `2px solid ${color}`,
    }) satisfies CSSProperties,
  findingTitleRow: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  findingTitle: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 } satisfies CSSProperties,
  findingLoc: { fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
} as const;
