import type { CSSProperties } from "react";

/** Co-located styles for PersonaPickCard (design-mocks/src/19-screen_multiagent.jsx:93-105). */
export const s = {
  card: (color: string, selected: boolean) =>
    ({
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "12px 14px",
      borderRadius: 9,
      cursor: "pointer",
      textAlign: "left",
      width: "100%",
      border: `1px solid ${selected ? color : "var(--border)"}`,
      background: selected ? `${color}12` : "var(--bg-elevated)",
      transition: "border-color .12s, background .12s",
    }) satisfies CSSProperties,
  checkbox: (color: string, selected: boolean) =>
    ({
      width: 18,
      height: 18,
      borderRadius: 5,
      flexShrink: 0,
      marginTop: 1,
      display: "grid",
      placeItems: "center",
      border: `1.5px solid ${selected ? color : "var(--border-strong)"}`,
      background: selected ? color : "transparent",
    }) satisfies CSSProperties,
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
  body: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  summary: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 } satisfies CSSProperties,
  estimate: {
    fontSize: 10.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
